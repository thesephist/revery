package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	readability "github.com/go-shiori/go-readability"
)

func main() {
	wordCoords, err := parseModelFile("./models/fasttext-commoncrawl-150k.vec")
	if err != nil {
		log.Fatalln("Could not read model file:", err)
	}
	fmt.Println("Parsed model file.")

	docs, err := parseDocsFile("./corpus/docs.json", wordCoords)
	if err != nil {
		log.Fatalln("Could not read corpus file:", err)
	}
	fmt.Println("Parsed docs corpus.")

	// web server
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
		similarDocs := closestDocs(docs, docVector, maxResults)
		respBytes, err := json.Marshal(similarDocs)
		if err != nil {
			io.WriteString(w, "error encoding JSON")
			return
		}

		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Write(respBytes)
	})

	http.HandleFunc("/", func(w http.ResponseWriter, req *http.Request) {
		io.WriteString(w, "revery.thesephist.com\n")
	})

	log.Fatal(http.ListenAndServe(":9998", nil))
}
