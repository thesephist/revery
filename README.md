# Revery 🦅

**Revery** is a _semantic search engine_ that operates on my [Monocle](https://thesephist.com/posts/monocle) search index. While Revery lets me search through the same database of tens of thousands of notes, bookmarks, journal entries, Tweets, contacts, and blog posts as Monocle, Revery's focus is not on _keyword-based_ search that Monocle performs, but instead on _semantic search_ -- finding results that are topically similar to some given web page or query, even if they don't share the same words. It's available as a browser extension that can surface relevant results to the current page, as well as a more standard web app resembling Monocle's search page.

![Revery's browser extension and web interface running on an iPad and a laptop](static/img/revery-devices.png)

Unlike most of my side projects, because of the size of data and amount of computational work Revery requires, its backend is written in Go. Both clients -- the web app and the browser extension -- are buitl with [Torus](https://github.com/thesephist/torus).

Although it works well enough for me to use it every day, Revery is more of a proof-of-concept prototype than a finished product. I wanted to demonstrate that a tool like this could be built for personal use on top of personal productivity tools like notes and bookmarks, and experience what it would feel like to browse the web and write with such a tool.

## Features

Revery, at its core, is just a single API. The API takes in some text, and crawls through my collection of personal documents and notes to find the top ones that seem most topically related to the given text. To make this interesting to use, I've wrapped it up in two different interfaces: a browser extension, and a more standard web-based search interface.

### Browser extension

The Revery browser extension lives inside `./extension` in this repository, and does exactly one thing: when I hit `Ctrl-Shift-L` on any webpage I'm viewing, it'll scrape the main body of text from the page (or some selected part of it, if I've highlighted something) and talk to the Revery API to find the documents that are most related to what I'm reading.

![Revery's browser extension showing a list of related results](static/img/revery-extension.png)

Where Monocle, with its keyword-based search algorithm, is good for recollection, I've found the Revery extension great for **explorations on a specific topic**. If I'm reading about natural language processing, for example, I can hit a few keystrokes to bring up other articles I've read, or notes I've taken in the past, that I can mentally reference as I read and learn about new ideas in NLP.

**We learn new ideas best when we can find existing referene points in our memory onto which we can attach new information. Revery's extension partly automates and speeds up that task.** For example, while reading an article about South Korea's unique cultural and economic position in the world, Revery surfaced a few related newsletters and articles from completely different authors and sources on Korean pop culture and its population decline, which helped me frame what I was reading in a much more broad, well-informed context.

### Web interface

The web search interface, to me, is a bit secondary to the extension. It exists primariliy as a demonstration of Revery's underlying technology, and also incidentally as a way for me to use Revery when the extension isn't available (like on a mobile browser).

![Revery's web interface showing a list of results](static/img/revery-search-horizontal.png)

The search bar in the web interface can take either a URL or some key phrase. Given a URL (as in the screenshot above), Revery will download and read the web page itself to find related documents in the search index. Given a key phrase, Revery will try to suggest documents that contain similar words and speak on similar topics.

This kind of a search interface (as opposed to the extension) is useful to me for starting out thinking about something new, where I can type in a list of related words into the search box and immediately get a list of ideas and documents I'm familiar with that are related, without having to fashion the specific and well-crafted search queries that keyword-based search engines like Monocle require.

## How it works

As mentioned above, Revery's core is a single API endpoint that takes in some document and returns a list of most related documents from my search index. What makes Revery special is that this API performs a _semantic_ search, not simply a scan for matching keywords. This means that the top results may not even contain the same words as the query, as long as its contents are topically relevant.

This kind of semantic search is enabled by a search algorithm that uses _cosine similarity_ to cluster _document embeddings_ of the indexed documents. If that sounds like a bunch of random words to you (as it did to me when I started this project), let me break it down:

First, we'll need to understand **[word embeddings](https://en.wikipedia.org/wiki/Word_embedding)**. A word embedding is a way of mapping a vocabulary of natural language words to some points in space (usually a high-dimensional mathematical space), such that words that are similar in meaning are close together in this space. For example, the word "science" in a word embedding would be very close to the word "scientist", reasonably close to "research", and likely very far from "circus".  When we talk about "distance" in the context of word embeddings, we usually use [cosine similarity](https://en.wikipedia.org/wiki/Cosine_similarity) rather than Euclidean distance, for both empirical and theoretical reasons I won't cover here.

Although the concept of word embeddings is not very new, there is still active research producing new methods for generating more and more accurate and useful word embeddings from the same corpus of data. My personal deployment of Revery uses the Creative Commons-licensed word embedding dataset produced by Facebook's [FastText](https://fasttext.cc/docs/en/support.html) tool, specifically a 50,000-word dataset with 300 dimensions trained on the [Common Crawl](https://commoncrawl.org/the-data/) corpus.

Word embeddings let us draw inferences about which _words_ are related, but for Revery, we want to draw the same kind of inference about _documents_, which are a list of words. Thankfully, there's ample literature to suggest that simply taking a weighted average of word vectors for every word in a document can get us a good approximation of a "document vector" that represents the document as a whole. Though there are more advanced methods we can use, like [paragraph vectors](https://arxiv.org/abs/1507.07998) or models that take word order into account like BERT, averaging word vectors works well enough for Revery's use cases, and is simple  to implement and test, so Revery sticks witih this approach.

Once we can generate document vectors out of documents using our word embedding, the rest of the algorithm falls into place. On startup, Revery's API server indexes and generates document vectors for all of the documents it can find in my dataset (which isn't too large -- around 25,000 at time of writing), and on every request, the algorithm computes a document vector for the requested document, and sorts every document in the search index by its cosine distance to the query document, to return some top _n_ results.

Within Revery, every part of this algorithm is hand-written in Go. This is for a few reasons:

1. I wanted to encourage myself to understand these basic algorithms of the trade fully, by writing the code myself
2. Most open-source libraries to do this kind of computation are made available in Python packages, and I don't have great personal infrastructure for deploying and maintaining a Python application.
3. Go is fast enough, anecdotally, for this task.

Both of the clients of Revery -- the extension and the web app -- talk to this single API endpoint. The clients themselves are quite ordinary, so I won't go into detail describing how they work here.

## Development and deploy

Here, the same disclaimer that I shared with Monocle also apply:

⚠️ _**Note**: If you're reading this section to try to set up and run your own Revery instance, I applaud your audacity, but it might not be super easy or fruitful -- Revery's setup (especially on the data and indexing side) is pretty specific not only to my data sources, but also the way I structure those files. I won't stop you from trying to build your own search index, but be warned: it might not work, and I'm probably not going to do tech support. For this reason, this section is also written in first-person, mostly for my future reference._

Revery depends on the search index produced by [Monocle](https://github.com/thesephist/monocle)'s indexer, so I usually make sure Revery has a recent copy of Monocle's search index available before running.

Revery has two independent codebases in the same repository. The first is the Chrome extension, which lives entirely inside the `./extension` folder. Here's how I set it up:

1. The extension needs an API authentication token to talk to the Revery API. I usually just choose an arbitrarily long random string. Then, I place a file in `./extension` called `token.js` with the content:

	```js
	const REVERY_TOKEN = '<some API key here>';
	```
2. I go to `chrome://extensions` and click "Load unpacked" to load the `./extension` folder as an "unpacked extension" into my browser, which willl make the extension available in every tab.

That's it for the extension setup. Next, I set up the server:

1. Take the same authentication token from above, and place just the token string itself inside `tokens.txt` in the root of the project folder. The Revery server will grab the whitespace-trimmed content of this file and use it as the API key.
2. Simply running `make` will build the `revery` binary executable into the project folder.
3. Revery needs two extra sets of data to work: the word embedding model, and Monocle's document dataset.
	- Download a word embedding file (for example, from [FastText](https://fasttext.cc/docs/en/english-vectors.html)) and trim it to some reasonble size (top 50-100k words seems to work well). Trim the first line, which usually indicates the total word count and number of dimensions. Revery's code assumes 300 dimensions, so if this is not the case, revise the code.
	- Copy Monocle's `docs.json` document dataset generated by the indexer to `./corpus/docs.json`.
4. Running the `revery` executable now should correctly pre-process the model and search index, and start the web application server.

## Prior art and future work

Although Revery is useful enough for me to use day to day, There's a lot of active research in the general natural language search space, and Revery itself has a lot of room for improvements.

On the data side:

- Experimenting with other word embeddings which may provide better performance. I've tried FastText and LexVec, but there are many other open models available.
- Generating a custom word embedding optimized for my dataset and for use in forming document vectors

On the code side:

- Optimizing the algorithms that touch data to scale better, using some amount of caching and good old fashioned hand optimization of the code
- Better ways to surface documents contextually in the browser. Right now, searching Revery within a browser requires an explicit user action. Perhaps we can surface them completely automatically, or even detect when a user has scrolled to the end of a page or highlighted an interesting section of the document to automatically suggest related documents.
- Better ways to balance the benefits of keyword-based and semantic search. Right now, Monocle and Revery are two completely separate applications, but having both kinds of search collaborating with each other or even simply displaying side by side on screen may be more useful.

There is also plenty of great prior art in this space. Though I can't list them all here, there are a few that stand out as inspirations for Revery.

- [Monocle](https://github.com/thesephist/monocle), the direct predecessor to Revery that uses the same dataset for keyword search
- [same.energy](https://jacobjackson.com/searching-for-style/), which enables searching for tweets or photos of the same "style" using a transformer model
- [Semantica](https://psionica.org/tools/semantica/), which uses word embeddings to provide a lower-level tool to explore relationships between individual words and concepts
- [Tyler Angert's _Information forest_](https://tyler.cafe/information_forest?utm_source=pocket_mylist), an imaginative note about web browsers of the future
- [_Document embedding techniques_](https://towardsdatascience.com/document-embedding-techniques-fed3e7a6a25d), which served as a useful overview of the field when I began this project
