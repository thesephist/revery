const {
    Record,
    Component,
} = window.Torus;

const MAX_RESULTS = 50;

function isURL(maybeURL) {
    try {
        new URL(maybeURL);
    } catch (e) {
        return false;
    }
    return true;
}

function getQueryFromURL() {
    const url = new URL(location.href);
    const searchType = url.searchParams.get('type') | 'url';
    const query = url.searchParams.get('q') || '';
    return { searchType, query }
}

async function fetchSimilarDocs(searchType, query) {
    const url = new URL(location.origin);
    url.pathname = '/similar';
    url.searchParams.set('n', MAX_RESULTS);

    try {
        let resp;
        if (searchType === 'url') {
            url.searchParams.set('url', query);
            resp = await fetch(url);
        } else {
            resp = await fetch(url, {
                method: 'POST',
                body: query,
            });
        }
        const docs =  await resp.json();
        return docs;
    } catch (e) {
        console.error(`[revery] error: could not load similar: ${e}`);
        return [];
    }
}

function Suggestion(searchType, query, displayText) {
    displayText = displayText ||
        (query.startsWith('https://') ? query.substr(8) : query);
    return jdom`<button class="search-suggestion" onclick="${evt => {
        state.update({
            searchType,
            query,
        });
        searchState();
    }}">${displayText}</button>`;
}

function AboutPage() {
    return jdom`<div class="about-page">
        <h2>Suggestions</h2>
        <div class="search-suggestions">
            ${[
                Suggestion('query', 'semantic search engine'),
                Suggestion('url', 'https://thesephist.com'),
                Suggestion('query', 'meaning purpose life'),
                Suggestion('query', 'tools for thought'),
                Suggestion('url', 'http://www.paulgraham.com/ds.html', '"Do things that don\'t scale"'),
                Suggestion('query', 'software career advice'),
                Suggestion('url', 'https://thesephist.com/posts/inc/', '"Incremental note-taking"'),
                Suggestion('query', 'hard problems in computer science'),
            ]}
        </div>
        <h2>About Revery</h2>
        <p>
            Revery is a personal semantic search engine by
            <a href="https://thesephist.com/" target="_blank">Linus</a>.
            It's built with
            <a href="https://github.com/thesephist/torus" target="_blank">Torus</a>
            and Go, and the code is
            <a href="https://github.com/thesephist/revery">open source on GitHub</a>
            alongside a deeper dive into how Revery works.
        </p>
        <p>
            Revery is powered by an efficient document embedding algorithm for
            natural language classification and clustering on top of the
            <a href="https://fasttext.cc/docs/en/english-vectors.html" target="_blank">FastText</a>
            precomputed word vectors. It shares the search database with
            <a href="https://thesephist.com/posts/monocle" target="_blank">Monocle</a>,
            a personal search engine indexing tens of thousands of personal
            documents and public work.
        </p>
    </div>`;
}

function Doc(doc, openDocs, render) {
    function ellipsize(s, chars) {
        if (s.length <= chars) return s;
        return s.substr(0, chars) + '...';
    }

    return jdom`<div class="doc-item" onclick="${evt => {
        if (openDocs.has(doc.id)) {
            openDocs.delete(doc.id);
        } else {
            openDocs.add(doc.id);
        }
        render();
    }}">
        <div class="doc-title">${doc.title}</div>
        <div class="doc-meta">
            ${doc.module}${
                doc.href ? ' • ' : ''
            }${doc.href ? jdom`<a href="${doc.href}"
                class="doc-href"
                target="_blank">${doc.href}</a>` : null}
        </div>
        <div class="doc-content" style="white-space:${openDocs.has(doc.id) ? 'pre-wrap' : 'initial'}">
            ${openDocs.has(doc.id) ? doc.content : ellipsize(doc.content, 280)}
        </div>
    </div>`
}

class App extends Component {
    init(state) {
        this._openDocs = new Set();
        this.bind(state, data => this.render(data))

        document.body.addEventListener('keydown', evt => {
            switch (evt.key) {
                case 'Escape': {
                    evt.preventDefault();
                    this.record.update({
                        searchType: 'url',
                        query: '',
                        docs: [],
                    });
                    this.node.querySelector('input').focus();

                    // sync URL state
                    searchState();
                    break;
                }
                case '`': {
                    evt.preventDefault();
                    this.record.update({
                        _theme: this.record.get('_theme') === 'light' ? 'dark' : 'light',
                    });
                    break;
                }
                case '/': {
                    evt.preventDefault();
                    this.node.querySelector('input').focus();
                    break;
                }
            }
        });
    }
    compose({ _loading, _theme, searchType, query, docs }) {
        if (_theme === 'light') {
            document.body.classList.remove('dark');
        } else {
            document.body.classList.add('dark');
        }

        return jdom`<div class="app">
            <header>
                <div class="logo">
                    <strong><a href="/">Revery</a></strong>, a semantic search engine
                </div>
            </header>
            <form class="inputs" autocomplete="off">
                <input type="text" value="${query}" name="query"
                    autofocus
                    placeholder="Find an idea..."
                    onkeydown="${evt => {
                        if (evt.key === 'Enter') {
                            evt.preventDefault();
                            searchState();
                        }
                    }}"
                    oninput="${evt => {
                        this.record.update({
                            searchType: isURL(evt.target.value) ? 'url' : 'query',
                            query: evt.target.value,
                        });
                    }}"/>
                ${query ? jdom`<button class="clearButton"
                    onclick="${evt => {
                        this.record.update({
                            searchType: 'url',
                            query: '',
                            docs: [],
                        });
                        this.node.querySelector('input').focus();
                    }}">×</button>` : null}
                <button class="searchButton"
                    onclick="${searchState}">${searchType === 'url' ? 'URL' : 'Topic'} <span class="icon">→</span></button>
            </form>
            ${_loading ?
                jdom`<div class="loading-container">
                    <div class="loading"/>
                </div>` :
                jdom`<div class="doc-list">
                    ${docs.length ? docs.map(d => Doc(d, this._openDocs, () => this.render(this.record.summarize()))) : AboutPage()}
                </div>`}
        </div>`;
    }
}

const state = new Record({
    _loading: false,
    _theme: 'light',

    // searchType, query
    ...getQueryFromURL(),
    docs: [],
});
async function searchState(evt) {
    if (evt) {
        evt.preventDefault();
    }

    const { searchType, query } = state.summarize();

    if (query === '') {
        const url = new URL(location.href);
        url.searchParams.delete('type');
        url.searchParams.delete('q');
        history.replaceState(null, null, url.toString());
        document.title = 'Revery, semantic search';

        state.update({
            docs: [],
        });
        return;
    }

    const url = new URL(location.href);
    url.searchParams.set('type', searchType);
    url.searchParams.set('q', query);
    history.replaceState(null, null, url.toString());
    document.title = `${query} | Revery, semantic search`;

    state.update({
        _loading: true,
    });
    const docs = await fetchSimilarDocs(searchType, query);
    state.update({
        _loading: false,
        docs: docs,
    });
}
const app = new App(state);
document.getElementById('root').appendChild(app.node);

if (state.get('query') !== '') {
    searchState();
}

