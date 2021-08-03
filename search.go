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

func cosineDistBetween(a, b []float64) float64 {
	if len(a) != vectorDims {
		panic(fmt.Sprintf("Vec a length mismatch: %d", len(a)))
	}
	if len(b) != vectorDims {
		panic(fmt.Sprintf("Vec b length mismatch: %d", len(b)))
	}

	norms := norm(a) * norm(b)
	if norms == 0 {
		return math.MaxFloat64
	}

	var dotProduct float64 = 0
	for i, ai := range a {
		dotProduct += ai * b[i]
	}

	// We return a negative here so that we can sort by cosine distance
	return -dotProduct / norms
}

func closestDocs(docSlice []MonocleDoc, docCoord []float64, n int) []MonocleDoc {
	sort.Slice(docSlice, func(i, j int) bool {
		return cosineDistBetween(docCoord, docSlice[i].coords) < cosineDistBetween(docCoord, docSlice[j].coords)
	})

	return docSlice[:n]
}

func documentVector(wordCoords map[string]([]float64), words []string) []float64 {
	docVec := make([]float64, vectorDims)

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
