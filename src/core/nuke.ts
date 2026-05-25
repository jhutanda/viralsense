import { Post, RedditAPIClient } from '@devvit/public-api';

// --- TREND DETECTION ---

export async function fetchTrendingPosts(reddit: RedditAPIClient, subredditName: string): Promise<Post[]> {
  try {
    const postsResult = await reddit.getHotPosts({
      subredditName,
      limit: 15,
    }).all();
    return postsResult;
  } catch (error) {
    console.error("Error fetching trending posts:", error);
    return [];
  }
}

// --- VIRAL SCORE LOGIC ---
export interface LitePost {
  createdAt: { getTime(): number } | Date | number;
  score: number;
  numberOfComments: number;
}

export interface TrendMetrics {
  score: number;
  velocity: string;
  isViral: boolean;
}

export function calculateViralScore(post: LitePost): TrendMetrics {
  // Lightweight ML / Heuristic scoring logic
  // Score = Upvotes * (CommentCount / Upvotes) * (UpvoteRatio) / Hours Since Posting
  
  let createdTime: number;
  if (typeof post.createdAt === 'number') {
    createdTime = post.createdAt;
  } else if (post.createdAt instanceof Date) {
    createdTime = post.createdAt.getTime();
  } else if (post.createdAt && typeof post.createdAt.getTime === 'function') {
    createdTime = post.createdAt.getTime();
  } else {
    createdTime = Date.now();
  }
  
  const now = Date.now();
  const hoursSincePosting = Math.max(0.1, (now - createdTime) / (1000 * 60 * 60));
  
  const upvoteRatio = (post as { upvoteRatio?: number }).upvoteRatio ?? 1.0;
  
  // Calculate basic velocity (engagements per hour)
  const totalEngagement = post.score + post.numberOfComments;
  const engagementVelocity = totalEngagement / hoursSincePosting;
  
  let viralScore = (engagementVelocity * upvoteRatio);
  
  // Normalize score between 0 and 100 roughly
  viralScore = Math.min(100, Math.max(0, viralScore / 10));
  
  let velocityLabel = "Steady";
  if (viralScore > 80) velocityLabel = "Explosive 🚀";
  else if (viralScore > 50) velocityLabel = "Rising 📈";
  else if (viralScore > 20) velocityLabel = "Heating Up 🔥";

  return {
    score: Math.round(viralScore),
    velocity: velocityLabel,
    isViral: viralScore > 60
  };
}

// --- AI SUMMARIZATION ---
// Extractive summarization with lightweight TextRank-style ranking and sentiment hints
const DEFAULT_STOP_WORDS = new Set([
  'the','and','a','an','of','to','in','for','on','with','as','at','by','from','or','is','it','this','that','these','those',
  'be','was','were','are','am','i','you','we','they','his','her','its','their','our','my','has','had','have','but','not','so','if','when',
  'can','could','should','would','will','than','then','them','into','about','over','after','before','between','during','through'
]);

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeSentences(text: string): string[] {
  const matches = text.match(/[^.!?]+[.!?]+(?:\s|$)/g);
  if (!matches) {
    return text.trim().length > 0 ? [text.trim()] : [];
  }
  return matches.map((sentence) => sentence.trim()).filter(Boolean);
}

function tokenizeWords(text: string): string[] {
  return normalizeText(text).split(' ').filter((word) => word.length > 0);
}

function computeIdf(sentences: string[]): Record<string, number> {
  const documentCount = sentences.length;
  const documentFrequency: Record<string, number> = {};

  sentences.forEach((sentence) => {
    const uniqueWords = new Set<string>();
    tokenizeWords(sentence).forEach((word) => {
      if (!DEFAULT_STOP_WORDS.has(word) && word.length > 2) {
        uniqueWords.add(word);
      }
    });
    uniqueWords.forEach((word) => {
      documentFrequency[word] = (documentFrequency[word] || 0) + 1;
    });
  });

  return Object.fromEntries(
    Object.entries(documentFrequency).map(([word, count]) => [word, Math.log((documentCount + 1) / (count + 1)) + 1])
  );
}

function buildTfidfVectors(sentences: string[], idf: Record<string, number>): Record<string, number>[] {
  return sentences.map((sentence) => {
    const vector: Record<string, number> = {};
    const tokens = tokenizeWords(sentence).filter((word) => !DEFAULT_STOP_WORDS.has(word) && word.length > 2);

    tokens.forEach((word) => {
      const tf = (vector[word] || 0) + 1;
      vector[word] = tf * (idf[word] ?? 1);
    });

    const length = Math.sqrt(Object.values(vector).reduce((sum, value) => sum + value * value, 0));
    if (length > 0) {
      Object.keys(vector).forEach((word) => {
        const currentValue = vector[word] ?? 0;
        vector[word] = currentValue / length;
      });
    }

    return vector;
  });
}

function cosineSimilarity(vecA: Record<string, number>, vecB: Record<string, number>): number {
  let dot = 0;
  for (const [word, valueA] of Object.entries(vecA)) {
    dot += valueA * (vecB[word] ?? 0);
  }
  return dot;
}

function buildSimilarityMatrix(vectors: Record<string, number>[]): number[][] {
  const length = vectors.length;
  const matrix: number[][] = Array.from({ length }, () => new Array<number>(length).fill(0));

  for (let i = 0; i < length; i += 1) {
    const row = matrix[i]!;
    const vectorI = vectors[i]!;
    for (let j = 0; j < length; j += 1) {
      const vectorJ = vectors[j]!;
      row[j] = i === j ? 0 : cosineSimilarity(vectorI, vectorJ);
    }
  }

  return matrix;
}

function extractKeywords(sentences: string[], maxKeywords = 12): string[] {
  const wordScores: Record<string, number> = {};
  const idf = computeIdf(sentences);

  sentences.forEach((sentence) => {
    tokenizeWords(sentence).forEach((word) => {
      if (!DEFAULT_STOP_WORDS.has(word) && word.length > 2) {
        wordScores[word] = (wordScores[word] || 0) + (idf[word] ?? 1);
      }
    });
  });

  return Object.entries(wordScores)
    .sort(([, a], [, b]) => b - a)
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

function rankSentences(sentences: string[], matrix: number[][]): number[] {
  const damping = 0.85;
  const length = sentences.length;
  if (length === 0) return [];

  const scores: number[] = new Array<number>(length).fill(1 / length);
  const threshold = 1e-6;
  const maxIter = 100;

  for (let iter = 0; iter < maxIter; iter += 1) {
    const newScores: number[] = new Array<number>(length).fill((1 - damping) / length);

    for (let i = 0; i < length; i += 1) {
      let sum = 0;
      for (let j = 0; j < length; j += 1) {
        const row = matrix[j];
        if (!row) continue;

        const similarity = row[i] ?? 0;
        if (!similarity) continue;

        const outgoing = row.reduce((acc, value) => acc + value, 0) || 1;
        sum += (similarity / outgoing) * (scores[j] ?? 0);
      }
      newScores[i] = (newScores[i] ?? 0) + damping * sum;
    }

    const diff = newScores.reduce((acc, value, index) => acc + Math.abs(value - (scores[index] ?? 0)), 0);
    scores.splice(0, length, ...newScores);
    if (diff < threshold) break;
  }

  return scores;
}

function summarizeText(text: string, maxSentences = 3): string {
  const sentences = tokenizeSentences(text);
  if (sentences.length === 0) return '';
  if (sentences.length <= maxSentences) return sentences.join(' ');

  const idf = computeIdf(sentences);
  const vectors = buildTfidfVectors(sentences, idf);
  const matrix = buildSimilarityMatrix(vectors);
  const centralityScores = rankSentences(sentences, matrix);

  const keywords = new Set(extractKeywords(sentences, 12));
  const keywordScores = sentences.map((sentence) =>
    tokenizeWords(sentence).reduce((score, word) => score + (keywords.has(word) ? 1 : 0), 0)
  );

  const sentenceScores = centralityScores.map((score, index) => {
    const positionWeight = 1 / (1 + index * 0.8);
    return score * 0.7 + ((keywordScores[index] ?? 0) / 5) * 0.2 + positionWeight * 0.1;
  });

  const rankedSentences = sentences
    .map((sentence, index) => ({ sentence, index, score: sentenceScores[index] ?? 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.sentence);

  return rankedSentences.join(' ');
}

export async function generateAISummary(
  postTitle: string,
  postBody: string,
  options?: { maxSentences?: number }
): Promise<{ summary: string; sentiment: string }> {
  const text = postBody && postBody.trim().length > 0 ? postBody.trim() : postTitle.trim();
  const defaultSummary = text.length > 0 ? text.slice(0, 220) + (text.length > 220 ? '...' : '') : 'No content available.';

  if (!text) {
    return { summary: defaultSummary, sentiment: 'Neutral' };
  }

  const sentenceCount = tokenizeSentences(text).length;
  const adaptiveMaxSentences = options?.maxSentences ?? Math.min(6, Math.max(3, Math.ceil(sentenceCount / 4)));
  const summary = summarizeText(text, adaptiveMaxSentences);

  const positiveWords = [
    'good', 'great', 'excellent', 'awesome', 'fantastic', 'positive', 'love', 'like', 'happy', 'amazing', 'success', 'win', 'strong', 'growth'
  ];
  const negativeWords = [
    'bad', 'terrible', 'awful', 'hate', 'poor', 'negative', 'sad', 'worst', 'disappoint', 'annoy', 'drop', 'decline', 'fail'
  ];

  const lower = normalizeText(text);
  const posCount = positiveWords.reduce((count, word) => count + (lower.includes(word) ? 1 : 0), 0);
  const negCount = negativeWords.reduce((count, word) => count + (lower.includes(word) ? 1 : 0), 0);
  const sentimentLabel = posCount > negCount ? 'Positive' : negCount > posCount ? 'Negative' : 'Neutral';
  const sentimentEmoji = sentimentLabel === 'Positive' ? '🟢' : sentimentLabel === 'Negative' ? '🔴' : '🟡';
  const sentiment = `${sentimentEmoji} ${sentimentLabel}`;

  return {
    summary: summary || defaultSummary,
    sentiment,
  };
}

export async function summarizeArticle(
  articleText: string,
  options?: { maxSentences?: number }
): Promise<{ summary: string; sentiment: string }> {
  return generateAISummary('', articleText, options);
}
