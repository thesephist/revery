package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	readability "github.com/go-shiori/go-readability"
)

const modelPath = "./models/fasttext-commoncrawl-150k.vec"

type wordVector struct {
	word   string
	coords []float64
}

type modelParser struct {
	scanner *bufio.Scanner
}

type MonocleDoc struct {
	Title   string             `json:"title"`
	Href    string             `json:"href"`
	Id      string             `json:"id"`
	Module  string             `json:"module"`
	Tokens  map[string]float64 `json:"tokens"`
	Content string             `json:"content"`
	coords  []float64
}

func (d *MonocleDoc) weightedTokenList() []string {
	words := make([]string, 0, len(d.Tokens))
	for token, count := range d.Tokens {
		for i := count; i > 0; i-- {
			words = append(words, token)
		}
	}
	return words
}

func NewModelParser(rd io.Reader) modelParser {
	return modelParser{
		scanner: bufio.NewScanner(rd),
	}
}

func (p *modelParser) parse() ([]wordVector, error) {
	wordVectors := []wordVector{}
	for p.scanner.Scan() {
		vec, err := parseModelLine(p.scanner.Text())
		if err != nil {
			return wordVectors, err
		}

		wordVectors = append(wordVectors, vec)
	}
	return wordVectors, p.scanner.Err()
}

func parseModelLine(line string) (wordVector, error) {
	words := strings.Split(strings.TrimSpace(line), " ")
	coords := make([]float64, len(words)-1)

	var err error
	for i, coordString := range words[1:] {
		coords[i], err = strconv.ParseFloat(coordString, 64)
		if err != nil {
			return wordVector{}, err
		}
	}

	return wordVector{
		word:   words[0],
		coords: coords,
	}, nil
}

func norm(a []float64) float64 {
	var sum float64 = 0
	for _, n := range a {
		sum += n * n
	}
	return math.Sqrt(sum)
}

// equivalent to normalizedDistSqBetween, with better performance
func cosineDistBetween(a, b []float64) float64 {
	if len(a) != len(b) {
		panic(fmt.Sprintf("len(a) != len(b) -- %d, %d", len(a), len(b)))
	}

	norms := norm(a) * norm(b)
	if norms == 0 {
		return math.MaxFloat64
	}

	var dotProduct float64 = 0
	for i, ai := range a {
		dotProduct += ai * b[i]
	}

	// we return a negative here so that we can sort by cosine distance
	return -dotProduct / norms
}

func closestWords(wordVectors []wordVector, wordCoord []float64, n int) []string {
	sort.Slice(wordVectors, func(i, j int) bool {
		return cosineDistBetween(wordCoord, wordVectors[i].coords) < cosineDistBetween(wordCoord, wordVectors[j].coords)
	})

	words := make([]string, n)
	for i, w := range wordVectors[:n] {
		words[i] = w.word
	}
	return words
}

func closestDocs(docSlice []MonocleDoc, docCoord []float64, n int) []MonocleDoc {
	sort.Slice(docSlice, func(i, j int) bool {
		return cosineDistBetween(docCoord, docSlice[i].coords) < cosineDistBetween(docCoord, docSlice[j].coords)
	})

	return docSlice[:n]
}

func documentVector(wordCoords map[string]([]float64), words []string) []float64 {
	if len(words) == 0 {
		panic("documentVector: called with empty document!")
	}

	// TODO: dimensions shouldn't be hard-coded
	docVec := make([]float64, 300)

	// TODO: weight words by TF-IDF
	validWords := 0
	for _, word := range words {
		coords, ok := wordCoords[word]
		if !ok {
			continue
		}
		validWords++

		for i, c := range coords {
			docVec[i] += c
		}
	}

	// we do not normalize these average vectors because we perform only cosine
	// similarity on them

	return docVec
}

func main() {
	// get word vectors
	modelFile, err := os.Open(modelPath)
	if err != nil {
		log.Fatalln("Could not open model file:", err)
	}
	defer modelFile.Close()

	parser := NewModelParser(modelFile)
	wordVectors, err := parser.parse()
	if err != nil {
		log.Fatalln("Could not parse model file:", err)
	}

	wordCoords := map[string]([]float64){}
	for _, wv := range wordVectors {
		wordCoords[wv.word] = wv.coords
	}

	// generate doc vectors
	docsFile, err := os.Open("./corpus/docs.json")
	if err != nil {
		log.Fatalln("Could not open docs file:", err)
	}
	defer docsFile.Close()

	docsContent, err := io.ReadAll(docsFile)
	if err != nil {
		log.Fatalln("Could not read docs file:", err)
	}

	docsMaybeNoTokens := map[string]MonocleDoc{}
	err = json.Unmarshal(docsContent, &docsMaybeNoTokens)
	if err != nil {
		log.Fatalln("Could not unmarshal docs:", err)
	}

	docs := map[string]MonocleDoc{}
	docSlice := make([]MonocleDoc, 0, len(docs))
	for id, doc := range docsMaybeNoTokens {
		tokens := doc.weightedTokenList()
		if len(tokens) > 0 {
			doc.coords = documentVector(wordCoords, tokens)
			docs[id] = doc

			docSlice = append(docSlice, doc)
		}
	}

	fmt.Println("done preparing models.")

	// the web server
	http.HandleFunc("/similar", func(w http.ResponseWriter, req *http.Request) {
		maxResultsString := req.URL.Query().Get("n")
		maxResults, err := strconv.Atoi(maxResultsString)
		if err != nil {
			maxResults = 10 // default maxResults is 10
		}

		query := req.URL.Query().Get("q")
		tokens := strings.Fields(query)

		if len(tokens) == 0 && req.Method == "POST" {
			// maybe POST with data?
			body, err := io.ReadAll(req.Body)
			if err == nil {
				tokens = strings.Fields(string(body))
			}
		}

		if len(tokens) == 0 {
			// maybe there's a URL?
			url := req.URL.Query().Get("url")
			if url != "" {
				article, err := readability.FromURL(url, 10*time.Second)
				if err != nil {
					io.WriteString(w, "failed to read URL")
				}

				tokens = strings.Fields(article.Title + " " + article.TextContent)
			}
		}

		if len(tokens) == 0 {
			io.WriteString(w, "invalid query")
			return
		}

		docVector := documentVector(wordCoords, tokens)
		similarDocs := closestDocs(docSlice, docVector, maxResults)
		respBytes, err := json.Marshal(similarDocs)
		if err != nil {
			io.WriteString(w, "error encoding JSON")
			return
		}

		// fmt.Println(closestWords(wordVectors, docVector, 20))

		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Write(respBytes)
	})
	http.HandleFunc("/", func(w http.ResponseWriter, req *http.Request) {
		io.WriteString(w, "revery.thesephist.com\n")
	})
	log.Fatal(http.ListenAndServe(":9998", nil))
}
