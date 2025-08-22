# LLMCat - Your Personal AI Knowledge Base

**Automatically capture, manage, and search your conversations with various AI platforms.**

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/dandawong/llmcat)
[![Code Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen)](https://github.com/dandawong/llmcat)
[![License: ISC](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](https://github.com/dandawong/llmcat)

---

## 🚀 Introduction

LLMCat is a powerful browser extension designed to be your personal, local-first knowledge base for all your interactions with Large Language Models (LLMs). It automatically and seamlessly captures your conversations from various AI platforms, storing them securely on your local machine. With LLMCat, you can instantly search, retrieve, and manage your AI-driven insights without ever worrying about losing valuable information or juggling multiple platform histories.

In an era where we increasingly rely on AI for creative, technical, and analytical tasks, our conversations with these models become a valuable asset. However, these dialogues are often scattered across different services, making them difficult to track and leverage. LLMCat solves this problem by creating a unified, searchable archive of your AI interactions, turning ephemeral chats into a persistent and powerful personal knowledge repository.

This tool is built for developers, researchers, writers, students, and anyone who frequently uses AI platforms and wants to maintain a private, organized, and easily accessible record of their digital brainstorming sessions.

## ✨ Key Features

*   **✍️ Automatic Capture:** No manual saving required. LLMCat works in the background to log your conversations from all supported platforms.
*   **🔒 Private & Local-First:** All your data is stored exclusively on your own computer using IndexedDB. Nothing is ever sent to a third-party server.
*   **🔍 Powerful Full-Text Search:** Instantly find any conversation with a blazing-fast, client-side search that supports caching and performance optimizations.
*   **📊 Insightful Statistics:** Understand your AI usage patterns with a detailed statistics dashboard showing conversation counts, word counts, and platform distribution.
*   **📤 Flexible Export Options:** Easily export all your conversations to JSON or Markdown for backup, analysis, or sharing.
*   **🌐 Multi-Platform Support:** Works seamlessly with major AI platforms including ChatGPT, Google Gemini, Claude, and more.

## 🛠️ Tech Stack

*   **Core:** JavaScript (ESM)
*   **Styling:** Tailwind CSS
*   **Testing:** Jest, JSDOM, Fake-IndexedDB
*   **Dependencies:** Marked.js (for Markdown parsing), Highlight.js (for syntax highlighting), DOMPurify (for security).

## 🏁 Getting Started

Follow these instructions to set up the project for local development.

### Prerequisites

You need to have Node.js and npm (or a compatible package manager) installed on your system.

*   [Node.js](https://nodejs.org/) (v18 or higher recommended)
*   [npm](https://www.npmjs.com/)

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/dandawong/llmcat.git
    cd llmcat
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Build the project:**
    This command compiles the Tailwind CSS files.
    ```bash
    npm run build
    ```

4.  **Load the extension in your browser:**
    *   **Google Chrome / Microsoft Edge:**
        1.  Open the browser and navigate to `chrome://extensions`.
        2.  Enable "Developer mode" using the toggle switch.
        3.  Click on the "Load unpacked" button.
        4.  Select the root directory of the `llmcat` project.

##  usage

Once the extension is installed and enabled, it will automatically start capturing your conversations on supported AI platforms.

1.  Visit any of the supported platforms (e.g., `https://chat.openai.com`).
2.  Engage in a conversation with the AI.
3.  Click the LLMCat icon in your browser's toolbar to open the popup.
4.  Here you can view, search, and manage all your recorded conversations.
5.  To access settings, statistics, and export options, right-click the extension icon and select "Options".

## 🧪 Running Tests

To ensure code quality and stability, the project includes a comprehensive test suite.

Run the following command to execute all tests:
```bash
npm test
```

## 🤝 Contributing

Contributions are welcome! If you have ideas for new features, bug fixes, or improvements, please feel free to open an issue or submit a pull request. For major changes, please open an issue first to discuss what you would like to change.

Please make sure to update tests as appropriate.

## 📜 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.