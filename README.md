# Vokabelapp

Vokabelapp is a local React/Vite flashcard app for studying with JSON-based decks.
It currently supports multiple decks, searchable flashcards, lecture/category filters, progress tracking, and spaced repetition with the ratings **Bad**, **Medium**, and **Good**.

## Features

* React + Vite frontend
* Multiple JSON decks
* Automatic deck detection from `src/data/*.json`
* Classic flashcards: question → answer
* Search across cards
* Filter by lecture and category
* Local progress storage in the browser
* Spaced repetition:

  * Bad: review soon
  * Medium: review later
  * Good: review much later
* Adjustable repetition intervals
* German/English user interface
* Deck content can be fully English
* Works locally on a laptop

---

## Requirements

Before running the app, make sure the tools listed in `requirements.txt` are installed.

This is a JavaScript/React project.
The file `requirements.txt` is only a human-readable checklist for system requirements.

Do **not** run:

```bash
pip install -r requirements.txt
```

Instead, install the JavaScript dependencies with:

```bash
npm install
```

---

## How to install and run the app

### 1. Clone the repository

```bash
git clone https://github.com/antonwilhelmi/Vokabelapp.git
cd Vokabelapp
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the local development server

```bash
npm run dev
```

After starting the server, Vite will show a local URL, usually:

```text
http://localhost:5173/
```

Open this URL in your browser.

Important: Keep the terminal open while using the app.
If you close the terminal or stop the server, the app will no longer be available locally.

---

## Recommended Node.js version

Use Node.js version **22.12 or newer**.

You can check your installed versions with:

```bash
node -v
npm -v
```

If Node.js is not installed, install it with Homebrew on macOS:

```bash
brew install node
```

Then verify:

```bash
which node
node -v
npm -v
```

On macOS, a Homebrew installation usually shows something like:

```text
/opt/homebrew/bin/node
```

---

## How decks are loaded

The app automatically loads all JSON files from:

```text
src/data/
```

Every file ending in `.json` inside this folder is treated as a deck.

Example:

```text
src/data/imlDeck.json
src/data/imlDeck_quality_en_bullet_answers.json
src/data/statisticsDeck.json
```

After adding a new deck file, restart the dev server if the deck does not appear immediately:

```bash
Ctrl + C
npm run dev
```

The new deck should then appear in the deck dropdown menu.

---

## How to add a new deck

### 1. Create a new JSON file

Create a new file inside:

```text
src/data/
```

Example:

```text
src/data/myNewDeck.json
```

### 2. Use the required deck format

Each deck must have this structure:

```json
{
  "id": "my-new-deck",
  "title": {
    "de": "My New Deck",
    "en": "My New Deck"
  },
  "cards": [
    {
      "id": "CARD001",
      "lecture": "L1",
      "category": "Basics",
      "question": {
        "de": "What is supervised learning?",
        "en": "What is supervised learning?"
      },
      "answer": {
        "de": "Supervised learning uses labeled examples to learn a mapping from inputs to target outputs.",
        "en": "Supervised learning uses labeled examples to learn a mapping from inputs to target outputs."
      }
    }
  ]
}
```

---

## Deck format explained

### `id`

A unique identifier for the deck.

Example:

```json
"id": "iml-core"
```

Use lowercase letters, numbers, and hyphens if possible.

Good examples:

```text
iml-core
statistics-basics
spanish-a1
```

---

### `title`

The deck title shown in the app.

The app supports German and English UI labels, so the title uses both `de` and `en`.

If the deck content should only be English, use the same English title in both fields:

```json
"title": {
  "de": "Machine Learning Exam Cards",
  "en": "Machine Learning Exam Cards"
}
```

---

### `cards`

A list of flashcards.

Each card must contain:

```json
{
  "id": "CARD001",
  "lecture": "L1",
  "category": "Basics",
  "question": {
    "de": "Question text",
    "en": "Question text"
  },
  "answer": {
    "de": "Answer text",
    "en": "Answer text"
  }
}
```

---

## Card fields explained

### `id`

Every card needs a unique ID.

Examples:

```text
IML001
IMLB001
STAT001
VOCAB001
```

Do not use the same card ID twice across decks if you want progress tracking to remain clean.

---

### `lecture`

Used for filtering cards by lecture or chapter.

Examples:

```text
L1
L2
L10
Chapter 1
Basics
```

---

### `category`

Used for filtering cards by topic.

Examples:

```text
Pipeline
Regression
Classification
CNN
Sequence Models
Responsible AI
```

---

### `question`

The front side of the flashcard.

The app supports both `de` and `en`.

If the cards should be English only, put the same English question into both fields:

```json
"question": {
  "de": "When should you use logistic regression?",
  "en": "When should you use logistic regression?"
}
```

---

### `answer`

The back side of the flashcard.

For better learning, keep answers short and structured.

Recommended answer style:

```json
"answer": {
  "de": "• Use it for binary classification\n• It predicts probabilities\n• It works well as an interpretable baseline\n• It assumes a mostly linear decision boundary",
  "en": "• Use it for binary classification\n• It predicts probabilities\n• It works well as an interpretable baseline\n• It assumes a mostly linear decision boundary"
}
```

Use `\n` for line breaks in JSON strings.

---

## Recommended flashcard style

Good flashcards should be short, clear, and easy to actively recall.

Recommended rules:

1. Ask one clear question per card.
2. Avoid very long answers.
3. Prefer 3–5 bullet points.
4. Put definitions, use cases, advantages, disadvantages, and pitfalls into separate bullets.
5. Use scenario-based questions for exam preparation.
6. Avoid copying full lecture paragraphs.
7. Make the answer specific enough to check whether you really knew it.

Good example:

```json
{
  "id": "IML_EXAM_001",
  "lecture": "L6",
  "category": "Evaluation",
  "question": {
    "de": "A cancer screening model has high accuracy but misses many sick patients. Which metric should be prioritized and why?",
    "en": "A cancer screening model has high accuracy but misses many sick patients. Which metric should be prioritized and why?"
  },
  "answer": {
    "de": "• Prioritize recall / sensitivity\n• Recall measures how many actual positives are detected\n• False negatives are dangerous in screening\n• Accuracy can be misleading with imbalanced data",
    "en": "• Prioritize recall / sensitivity\n• Recall measures how many actual positives are detected\n• False negatives are dangerous in screening\n• Accuracy can be misleading with imbalanced data"
  }
}
```

---

## How progress is saved

Progress is saved locally in the browser using `localStorage`.

This means:

* Progress stays on the same browser and device.
* Progress is not automatically synced across devices.
* If browser storage is cleared, progress may be lost.
* Other users who clone the repository start with empty progress.

The app stores:

* number of reviews
* last rating
* last review time
* next due time

---

## How to reset progress

Use the **Reset progress** button inside the app.

This clears the locally saved progress from the browser.

It does not delete any deck files.

---

## How to contribute a new deck

1. Create a new JSON deck file in `src/data/`.
2. Make sure the JSON is valid.
3. Start the app locally and check that the deck appears.
4. Review several cards manually.
5. Commit the new deck.

Example:

```bash
git status
git add src/data/myNewDeck.json
git commit -m "Add new flashcard deck"
git push
```

---

## How to validate JSON

If a deck does not appear or the app shows an error, check whether the JSON is valid.

From the project root, run:

```bash
node -e "JSON.parse(require('fs').readFileSync('src/data/myNewDeck.json','utf8')); console.log('JSON is valid')"
```

Replace `myNewDeck.json` with the actual file name.

If the command prints:

```text
JSON is valid
```

the file is valid JSON.

---

## Common problems

### The app does not start

Run:

```bash
npm install
npm run dev
```

Also check:

```bash
node -v
npm -v
```

---

### A new deck does not appear

Check:

1. The file is inside `src/data/`.
2. The file ends with `.json`.
3. The JSON is valid.
4. The deck contains a non-empty `cards` array.
5. Restart the dev server:

```bash
Ctrl + C
npm run dev
```

---

### The app shows an import or JSON error

Usually this means:

* the JSON file has a missing comma
* a quote is not closed
* a bracket is missing
* the file is not inside `src/data/`
* the deck structure is incomplete

Validate the file with the JSON check command above.

---

## Project structure

```text
Vokabelapp/
├── index.html
├── package.json
├── package-lock.json
├── requirements.txt
├── src/
│   ├── App.jsx
│   ├── App.css
│   ├── main.jsx
│   ├── i18n.js
│   ├── storage.js
│   ├── scheduler.js
│   └── data/
│       ├── imlDeck.json
│       └── otherDecks.json
└── public/
```

---

## Tech stack

* React
* Vite
* JavaScript / JSX
* CSS
* JSON deck files
* Browser localStorage
* Node.js
* npm
* Git
* GitHub

---

## License / usage

This project is intended as a personal and educational study tool.

Before sharing lecture-based decks publicly, make sure you are allowed to share the content.
