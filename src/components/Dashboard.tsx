import { Devvit, useState, useAsync, type JSONValue } from '@devvit/public-api';
import { fetchTrendingPosts, calculateViralScore, generateAISummary } from '../core/nuke.js';

export type PlainPost = {
  id: string;
  title: string;
  body?: string;
  score: number;
  numberOfComments: number;
  createdAt: number;
  [key: string]: unknown;
};

export const Dashboard = (context: Devvit.Context) => {
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  
  // Fetch Top/Hot Posts
  const { data: postsData, loading: postsLoading } = useAsync(async () => {
    const rawPosts = await fetchTrendingPosts(context.reddit, context.subredditName || "");
    return rawPosts.map((p: any) => ({
      id: p.id,
      title: p.title,
      body: p.body || "",
      score: p.score,
      numberOfComments: p.numberOfComments,
      createdAt: p.createdAt.getTime(),
    } as PlainPost)) as unknown as JSONValue;
  }, { depends: [] });

  const posts = postsData as PlainPost[] | null;

  // Fetch Summary when a post is selected
  const { data: summaryDataRaw, loading: summaryLoading } = useAsync(async () => {
    if (!selectedPostId || !posts) return null;
    const post = posts.find((p: PlainPost) => p.id === selectedPostId);
    if (!post) return null;
    return await generateAISummary(post.title, post.body || '');
  }, { depends: [selectedPostId, posts as unknown as JSONValue] });

  const summaryData = summaryDataRaw as { summary: string; sentiment: string } | null;

  // Modern Dark-Themed UI Styles
  const theme = {
    bg: '#0F172A',         // Slate 900
    cardBg: '#1E293B',     // Slate 800
    textPrimary: '#F8FAFC', // Slate 50
    textSecondary: '#94A3B8', // Slate 400
    accent: '#3B82F6',     // Blue 500
    success: '#10B981',    // Emerald 500
    warning: '#F59E0B',    // Amber 500
    danger: '#EF4444'      // Red 500
  };

  if (postsLoading) {
    return (
      <vstack alignment="center middle" grow backgroundColor={theme.bg} padding="medium">
        <text color={theme.accent} size="large" weight="bold">🚀 Detecting Trends...</text>
      </vstack>
    );
  }

  const selectedPost = posts?.find((p: PlainPost) => p.id === selectedPostId);
  const trendingList = posts?.slice(0, 5) || [];

  return (
    <vstack grow backgroundColor={theme.bg} padding="medium" gap="medium">
      {/* HEADER */}
      <hstack alignment="middle start" gap="small">
        <text size="xlarge" weight="bold" color={theme.textPrimary}>📈 TrendLens</text>
        <text size="medium" color={theme.textSecondary}>Viral Prediction & AI Insights</text>
      </hstack>

      {!selectedPostId ? (
        // DASHBOARD VIEW
        <vstack gap="medium" grow>
          <text color={theme.accent} weight="bold">🔥 Rising Topics</text>
          
          {trendingList.map((post: PlainPost) => {
            const metrics = calculateViralScore(post);
            const scoreColor = metrics.score > 70 ? theme.danger : metrics.score > 40 ? theme.warning : theme.success;

            return (
              <hstack 
                backgroundColor={theme.cardBg} 
                padding="medium" 
                cornerRadius="medium" 
                gap="medium" 
                alignment="middle"
                onPress={() => setSelectedPostId(post.id)}
              >
                {/* Score Indicator */}
                <vstack alignment="center middle" width="48px" height="48px" backgroundColor={theme.bg} cornerRadius="full">
                  <text color={scoreColor} weight="bold" size="large">{metrics.score}</text>
                  <text color={theme.textSecondary} size="small">VR</text>
                </vstack>
                
                {/* Post Info */}
                <vstack grow gap="small">
                  <text color={theme.textPrimary} weight="bold" wrap>{post.title.substring(0, 60)}...</text>
                  <hstack gap="medium">
                    <text color={theme.textSecondary} size="small">⬆️ {post.score}</text>
                    <text color={theme.textSecondary} size="small">💬 {post.numberOfComments}</text>
                    <text color={theme.accent} size="small">{metrics.velocity}</text>
                  </hstack>
                </vstack>
              </hstack>
            );
          })}
        </vstack>
      ) : (
        // DETAIL VIEW
        <vstack gap="medium" grow backgroundColor={theme.cardBg} padding="medium" cornerRadius="medium">
          <hstack alignment="middle" gap="small">
            <button appearance="plain" onPress={() => setSelectedPostId(null)}>
              ← Back
            </button>
            <text color={theme.textPrimary} weight="bold">Topic Insight</text>
          </hstack>

           <text color={theme.textPrimary} size="large" weight="bold" wrap>{selectedPost?.title || ''}</text>
          
          {/* AI Summary Section */}
          <vstack gap="small" padding="small" backgroundColor={theme.bg} cornerRadius="medium">
            <text color={theme.accent} weight="bold">🤖 Compressed AI Summary</text>
            {summaryLoading ? (
              <text color={theme.textSecondary}>Generating insights...</text>
            ) : summaryData ? (
              <vstack gap="small">
                <text color={theme.textPrimary} wrap>{summaryData.summary}</text>
                <hstack gap="small">
                  <text color={theme.textSecondary}>Sentiment:</text>
                  <text color={summaryData.sentiment === 'Positive' ? theme.success : summaryData.sentiment === 'Negative' ? theme.danger : theme.warning} weight="bold">
                    {summaryData.sentiment}
                  </text>
                </hstack>
              </vstack>
            ) : (
              <text color={theme.danger}>Failed to load AI summary. Please check API Key.</text>
            )}
          </vstack>

          {/* Viral Stats */}
          {selectedPost ? (() => {
            const m = calculateViralScore(selectedPost);
            return (
               <hstack gap="medium" padding="small">
                  <vstack alignment="center middle" grow>
                    <text color={theme.textSecondary} size="small">Viral Score</text>
                    <text color={theme.textPrimary} weight="bold" size="large">{m.score}/100</text>
                  </vstack>
                  <vstack alignment="center middle" grow>
                    <text color={theme.textSecondary} size="small">Trajectory</text>
                    <text color={theme.accent} weight="bold">{m.velocity}</text>
                  </vstack>
               </hstack>
            );
          })() : <spacer />}

        </vstack>
      )}
    </vstack>
  );
};
