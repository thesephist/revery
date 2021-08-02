package main

import (
	"fmt"
	"math"
	"sort"
)

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

	for _, word := range words {
		coords, ok := wordCoords[word]
		if !ok {
			continue
		}

		for i, c := range coords {
			docVec[i] += c
		}
	}

	// we do not normalize these average vectors because we perform only cosine
	// similarity on them

	return docVec
}
