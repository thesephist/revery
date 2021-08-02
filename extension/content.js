const {
	Record,
	Component,
	ListOf,
} = window.Torus;

const MAX_RESULTS = 20;

const REVERY_ORIGIN = 'http://localhost:9998';

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
		z-index: 9999999999999;
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

	.doc-list {
		max-height: calc(100vh - 200px);
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

class App extends Component {
	init(state) {
		this._openDocs = new Set();
		this.bind(state, data => this.render(data));
	}

	isDocOpen(doc) {
		return this._openDocs.has(doc.id);
	}

	compose({ loading, docs }) {
		return jdom`<div class="revery-root">
			<header>
				<div class="logo"><strong>Revery</storng> semantic search</div>
				<button class="closeButton" onclick=${closeUI}>×</button>
			</header>
			${loading ? jdom`<div class="loading-container">
				<div class="loading"></div>
			</div>` : null}
			<div class="doc-list">
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
			</div>
		</div>`;
	}
}

async function fetchSimilarToText(text) {
	const url = new URL(REVERY_ORIGIN);
	url.pathname = '/similar';
	url.searchParams.set('n', MAX_RESULTS);

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

function fetchSimilarDocs() {
	const selection = window.getSelection().toString().trim();
	if (selection) {
		return fetchSimilarToText(selection);
	}

	const readability = new Readability(document.cloneNode(true), {
		charThreshold: 20,
	});
	const article = readability.parse();
	return fetchSimilarToText(article.textContent);
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
			const state = new Record({
				loading: true,
				docs: [],
			});
			const app = new App(state);
			shadowRoot.appendChild(app.node);

			// update when data is available
			const docs = await fetchSimilarDocs();
			state.update({
				loading: false,
				docs,
			});
		}
    }
});

