# TrendLens

TrendLens is an AI-powered Reddit trend prediction and compressed insight platform built natively on Reddit using the Devvit platform.

## Features
- **Trending Detection**: Detect trending Reddit posts and rising topics across the subreddit.
- **Viral Score**: Predicts which posts may go viral using a heuristic based on upvote/comment velocity and engagement metrics.
- **AI Summary**: Generates compressed AI summaries of long Reddit threads and sentiment analysis.
- **Clean UI**: A dark-themed, modern dashboard right inside Reddit custom posts.

## Architecture
- `src/main.tsx`: Entry point for the Devvit Custom Post and App Settings.
- `src/components/Dashboard.tsx`: The modern Devvit block UI component for displaying trending topics and insights.
- `src/core/nuke.ts`: The core engine processing viral scores, connecting to Reddit API, and OpenAI endpoints.

## Setup Instructions

### 1. Install Dependencies
Ensure you have installed the newly configured Devvit SDK packages.
```bash
npm install
```

### 2. Configure OpenAI API Key
For the AI Summarization to work, you need to provide an OpenAI API key.
1. Install the app in a subreddit.
2. Go to the Subreddit's App Settings.
3. Add your `OpenAI API Key` under the TrendLens settings.

### 3. Run Locally
```bash
devvit playtest <subreddit-name>
```

Add a "TrendLens Dashboard" custom post to your subreddit to view the dashboard!
