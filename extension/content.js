const {
    Record,
    Component,
    ListOf,
} = window.Torus;

const MAX_RESULTS = 20;

const REVERY_ORIGIN = 'https://revery.linus.zone';

const SHADOW_STYLES = `
    .revery-root {
        all: initial;
        font-family: system-ui, sans-serif;
        font-size: 14px;

        /* color variables taken from Merlot */
        --primary-bg: #fdfeff;
        --primary-text: #111111;
        --secondary-bg: #f3f4f6;
        --secondary-text: #9b9b9b;
        --hover-bg: #dde1e5;
        --active-bg: #cdcfd2;
        --translucent: rgba(249, 250, 251, .8);
        --transparent: rgba(249, 250, 251, 0);
        --search-highlight: #a6f1e1;

        position: fixed;
        top: 8px;
        right: 8px;
        width: calc(100vw - 16px);
        max-width: 400px;
        z-index: 2147483647;
        border-radius: 6px;
        color: var(--primary-text);
        background: var(--primary-bg);
        box-shadow: 0 2px 6px rgba(0, 0, 0, .16);
        border: 1px solid var(--active-bg);
        transition: height .4s;
    }

    header {
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid var(--active-bg);
        padding: 4px 4px;
        box-shadow: 0 1px 4px rgba(0, 0, 0, .16);
    }

    header .logo {
        text-transform: uppercase;
        margin-left: 8px;
        color: var(--secondary-text);
    }

    header .logo strong {
        color: var(--primary-text);
    }

    header button.closeButton {
        cursor: pointer;
        border: 0;
        background: transparent;
        width: 1.5em;
        height: 1.5em;
        display: block;
        font-size: 18px;
        line-height: 1.5em;
        border-radius: 6px;
    }

    header button.closeButton:hover {
        background: var(--hover-bg);
    }

    details.summary {
        padding: 6px 12px;
        line-height: 1.4em;
        border-bottom: 1px solid var(--active-bg);
    }

    details.summary summary {
        cursor: pointer;
        padding: 2px 6px;
        border-radius: 4px;
        margin: -2px -6px;
    }

    details.summary summary:hover {
        background: var(--hover-bg);
    }

    ul.summaryText {
        padding-left: 18px;
        margin: 8px 0 0 0;
    }

    .summaryText li {
        margin-bottom: 8px;
    }

    .doc-list {
        max-height: calc(100vh - 64px);
        overflow-y: auto;
    }

    .doc-item {
        cursor: pointer;
        padding: 6px 12px;
        line-height: 1.4em;
        border-bottom: 1px solid var(--active-bg);
    }

    .doc-item:hover {
        background: var(--hover-bg);
    }

    .doc-title {
        font-weight: bold;
    }

    .doc-meta {
        font-size: 12px;
        color: #555;
    }

    a.doc-href {
        color: inherit;
        text-decoration: none;
    }

    a.doc-href:hover {
        text-decoration: underline;
    }

    /* loading animation */

    .loading-container {
        height: 72px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        padding: 0 32px;
    }

    .loading {
        width: 100%;
        flex-grow: 1;
        margin: 0;
        height: 3px;
        position: relative;
        background: var(--hover-bg);
        overflow: hidden;
    }

    @keyframes slider {
        0% {
            transform: translateX(-100%);
        }
        100% {
            transform: translateX(100%);
        }
    }

    .loading::after {
        content: '';
        display: block;
        height: 100%;
        width: 60%;
        padding-right: 40%;
        background-color: var(--primary-text);
        position: absolute;
        top: 0;
        left: 0;
        animation: slider 1s linear infinite;
    }
`;

function ellipsize(s, chars) {
    if (s.length <= chars) return s;
    return s.substr(0, chars) + '...';
}


// algorithm ported from github.com/thesephist/micropress
// Unlike Micropress, summarize() here:
// - infers the desired length of summary automatically
// - returns an array of sentences, not a string
function summarize(text) {
    const maxChars = Math.min(1000, 50 + text.length * 0.1);

    const STOPWORDS = [
        'a', 'about', 'an', 'are', 'and', 'as', 'at', 'be', 'but', 'by', 'com',
        'do', 'don\'t', 'for', 'from', 'has', 'have', 'he', 'his', 'i', 'i\'m',
        'in', 'is', 'it', 'it\'s', 'just', 'like', 'me', 'my', 'not', 'of',
        'on', 'or', 'so', 't', 'that', 'the', 'they', 'this', 'to', 'was',
        'we', 'were', 'with', 'you', 'your',
    ];

    function tokenize(text) {
        const tokens = text.trim()
            .toLowerCase()
            .replaceAll(/[.,:;?!#%*()\[\]{}\\|/<>!"\-_]/g, ' ')
            .split(/\s+/)
            .filter(w => !STOPWORDS.includes(w));

        return tokens.reduce((acc, t) => {
            if (acc.has(t)) {
                acc.set(t, acc.get(t) + 1);
            } else {
                acc.set(t, 1);
            }
            return acc;
        }, new Map());
    }

    function tokensIntersectionScore(tok1, tok2) {
        const len1 = Array.from(tok1.values()).reduce((a, b) => a + b, 0);
        const len2 = Array.from(tok2.values()).reduce((a, b) => a + b, 0);

        if (len1 < 4 || len2 < 4) {
            return 0;
        }

        let sum = 0;
        for (const key of tok1.keys()) {
            if (tok2.has(key)) {
                sum += tok1.get(key) + tok2.get(key);
            }
        }
        return sum / (len1 + len2 + 1);
    }

    function upcaseFirstLetter(s) {
        return s[0].toUpperCase() + s.substr(1);
    }

    function stripTransition(sent) {
        switch (sent.substr(0, 4).toLowerCase()) {
            case 'and ':
            case 'but ':
                return upcaseFirstLetter(sent.substr(4));
            case 'and,':
            case 'but,':
                return upcaseFirstLetter(sent.substr(5));
        }
        return sent;
    }

    const paragraphs = text.split('\n\n').filter(s => s !== '').map(s => s.replaceAll(/\s+/g, ' '));
    const paragraphSentences = paragraphs.map(para => para.split(/[.?!] /g));
    const allSentences = paragraphSentences
        .flat()
        .map(sent => sent.trimEnd('.'))
        .filter(s => s !== '');

    const sentenceOrder = allSentences.reduce((acc, sent, i) => {
        acc.set(sent, i);
        return acc;
    }, new Map());
    const allTokens = allSentences.map(tokenize);

    const ranks = allSentences.reduce((ranks, sent, i) => {
        const tokens = allTokens[i];
        const score = allTokens.reduce((sum, other) => sum - tokensIntersectionScore(tokens, other), 0);
        ranks.set(sent, score);
        return ranks;
    }, new Map());
    allSentences.sort((sent1, sent2) => ranks.get(sent1) - ranks.get(sent2));

    let i = 0;
    const summarySentences = [];
    while (summarySentences.join(' ').length < maxChars && allSentences[i]) {
        summarySentences.push(allSentences[i++]);
    }
    summarySentences.sort((sent1, sent2) => sentenceOrder.get(sent1) - sentenceOrder.get(sent2));

    return summarySentences
        .map(stripTransition)
        .map(sent => sent + '.');
}

class App extends Component {
    init(state) {
        this._openDocs = new Set();
        this.bind(state, data => this.render(data));
    }

    isDocOpen(doc) {
        return this._openDocs.has(doc.id);
    }

    compose({ summary, loading, docs }) {
        return jdom`<div class="revery-root">
            <header>
                <div class="logo"><strong>Revery</storng> semantic search</div>
                <button class="closeButton" onclick=${closeUI}>×</button>
            </header>
            ${loading ? jdom`<div class="loading-container">
                <div class="loading"></div>
            </div>` : jdom`<div class="doc-list">
                <details class="summary" open>
                    <summary>Key points</summary>
                    <ul class="summaryText">
                        ${summary.map(sent => jdom`<li>${sent}</li>`)}
                    </ul>
                </details>
                ${docs.map(doc => {
                    return jdom`<div class="doc-item">
                        <div class="doc-title">${doc.title}</div>
                        <div class="doc-meta">
                            ${doc.module}${
                                doc.href ? ' • ' : ''
                            }${doc.href ? jdom`<a href="${doc.href}"
                                class="doc-href"
                                target="_blank">${doc.href}</a>` : null}
                        </div>
                        <div class="doc-content"
                            onclick=${evt => {
                                if (this._openDocs.has(doc.id)) {
                                    this._openDocs.delete(doc.id);
                                } else {
                                    this._openDocs.add(doc.id);
                                }
                                this.render();
                            }}>${this.isDocOpen(doc) ? doc.content : ellipsize(doc.content, 280)}</div>
                    </div>`
                })}
            </div>`}
        </div>`;
    }
}

async function fetchSimilarToText(text) {
    const url = new URL(REVERY_ORIGIN);
    url.pathname = '/similar';
    url.searchParams.set('n', MAX_RESULTS);
    url.searchParams.set('token', REVERY_TOKEN);

    try {
        const resp = await fetch(url, {
            method: 'POST',
            body: text,
        });
        const docs =  await resp.json();
        return docs;
    } catch (e) {
        console.error(`[revery] error: could not load similar: ${e}`);
        return [];
    }
}

function getPageContent() {
    const selection = window.getSelection().toString().trim();
    if (selection) {
        return selection;
    }

    const readability = new Readability(document.cloneNode(true), {
        charThreshold: 20,
    });
    const article = readability.parse();
    return article.textContent;
}

const shadowContainer = document.createElement('div');
const shadowRoot = shadowContainer.attachShadow({ mode: 'closed' });
document.body.appendChild(shadowContainer);

let uiVisible = false;
function closeUI() {
    shadowRoot.innerHTML = '';
    uiVisible = false;
}

chrome.runtime.onMessage.addListener(async (msg) => {
    switch (msg.type) {
        case 'search': {
            if (uiVisible) {
                closeUI();
                return;
            }

            uiVisible = true;

            // styles
            const style = document.createElement('style');
            style.textContent = SHADOW_STYLES;
            shadowRoot.appendChild(style);

            // app
            const content = getPageContent();
            const state = new Record({
                summary: summarize(content),
                loading: true,
                docs: [],
            });
            const app = new App(state);
            shadowRoot.appendChild(app.node);

            // update when data is available
            const docs = await fetchSimilarToText(content);
            state.update({
                loading: false,
                docs,
            });
        }
    }
});

