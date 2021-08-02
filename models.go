package main

import (
	"bufio"
	"encoding/json"
	"io"
	"os"
	"strconv"
	"strings"
)

type wordVector struct {
	word   string
	coords []float64
}

type modelParser struct {
	scanner *bufio.Scanner
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

func parseModelFile(modelPath string) (map[string]([]float64), error) {
	// get word vectors
	modelFile, err := os.Open(modelPath)
	if err != nil {
		return nil, err
	}
	defer modelFile.Close()

	parser := NewModelParser(modelFile)
	wordVectors, err := parser.parse()
	if err != nil {
		return nil, err
	}

	wordCoords := map[string]([]float64){}
	for _, wv := range wordVectors {
		wordCoords[wv.word] = wv.coords
	}

	return wordCoords, err
}

func parseDocsFile(docsPath string, wordCoords map[string]([]float64)) ([]MonocleDoc, error) {
	// generate doc vectors
	docsFile, err := os.Open(docsPath)
	if err != nil {
		return nil, err
	}
	defer docsFile.Close()

	docsContent, err := io.ReadAll(docsFile)
	if err != nil {
		return nil, err
	}

	docsMaybeNoTokens := map[string]MonocleDoc{}
	err = json.Unmarshal(docsContent, &docsMaybeNoTokens)
	if err != nil {
		return nil, err
	}

	docSlice := []MonocleDoc{}
	for _, doc := range docsMaybeNoTokens {
		tokens := doc.weightedTokenList()
		if len(tokens) > 0 {
			doc.coords = documentVector(wordCoords, tokens)
			docSlice = append(docSlice, doc)
		}
	}

	return docSlice, nil
}
