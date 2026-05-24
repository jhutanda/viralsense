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

function buildSentenceVectors(sentences: string[]): Record<string, number>[] {
  return sentences.map((sentence) => {
    const vector: Record<string, number> = {};
    tokenizeWords(sentence).forEach((word) => {
      if (!DEFAULT_STOP_WORDS.has(word) && word.length > 2) {
        vector[word] = (vector[word] || 0) + 1;
      }
    });
    return vector;
  });
}

function cosineSimilarity(vecA: Record<string, number>, vecB: Record<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const [word, valueA] of Object.entries(vecA)) {
    normA += valueA * valueA;
    const valueB = vecB[word] ?? 0;
    dot += valueA * valueB;
  }

  for (const valueB of Object.values(vecB)) {
    normB += valueB * valueB;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function buildSimilarityMatrix(vectors: Record<string, number>[]): number[][] {
  const length = vectors.length;
  const matrix: number[][] = Array.from({ length }, () => new Array<number>(length).fill(0));

  for (let i = 0; i < length; i += 1) {
    for (let j = 0; j < length; j += 1) {
      const vectorI = vectors[i] as Record<string, number>;
      const vectorJ = vectors[j] as Record<string, number>;
      const row = matrix[i] as number[];
      row[j] = i === j ? 0 : cosineSimilarity(vectorI, vectorJ);
    }
  }

  return matrix;
}

function rankSentences(sentences: string[], matrix: number[][]): number[] {
  const damping = 0.85;
  const length = sentences.length;
  if (length === 0) return [];

  const scores: number[] = new Array<number>(length).fill(1 / length);
  const thresholds = 1e-6;
  const maxIter = 100;

  for (let iter = 0; iter < maxIter; iter += 1) {
    const newScores: number[] = new Array<number>(length).fill((1 - damping) / length);

    for (let i = 0; i < length; i += 1) {
      let sum = 0;
      const row = matrix[i] as number[];
      let rowSum = row.reduce((acc, value) => acc + value, 0);
      if (rowSum === 0) {
        rowSum = 1;
      }
      for (let j = 0; j < length; j += 1) {
        const rowJ = matrix[j] as number[];
        const rowJValue = rowJ[i] ?? 0;
        if (rowJValue > 0) {
          const jRowSum = rowJ.reduce((acc, value) => acc + value, 0) || 1;
          sum += (rowJValue / jRowSum) * (scores[j] ?? 0);
        }
      }
      newScores[i] = (newScores[i] ?? 0) + damping * sum;
    }

    const diff = newScores.reduce((acc, score, index) => acc + Math.abs(score - (scores[index] ?? 0)), 0);
    scores.splice(0, length, ...newScores);
    if (diff < thresholds) break;
  }

  return scores;
}

function summarizeText(text: string, maxSentences = 3): string {
  const sentences = tokenizeSentences(text);
  if (sentences.length === 0) return '';
  if (sentences.length <= maxSentences) return sentences.join(' ');

  const vectors = buildSentenceVectors(sentences);
  const matrix = buildSimilarityMatrix(vectors);
  const scores = rankSentences(sentences, matrix);

  const ranked = sentences
    .map((sentence, index) => ({ sentence, index, score: scores[index] ?? 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.sentence);

  return ranked.join(' ');
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

  const summary = summarizeText(text, options?.maxSentences ?? 3);

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
