import { Devvit } from '@devvit/public-api';
import { SummaryPage, articleSummarizerFormKey } from './components/SummaryPage.js';
import { generateAISummary } from './core/nuke.js';

// Helper type for Reddit post fields
type RedditPost = {
  title?: string;
  link_title?: string;
  selftext?: string;
  body?: string;
}
Devvit.configure({
  redditAPI: true,
  http: true,
});
// Define the form to display the article summary
const shortPostForm = Devvit.createForm(
  (data: { title?: string; summary?: string }) => ({
    title: 'ViralSense Summary',
    description: 'Short AI summary for the post.',
    acceptLabel: 'Close',
    fields: [
      {
        type: 'string',
        name: 'title',
        label: 'Title',
        disabled: true,
        defaultValue: data.title ?? '',
      },
      {
        type: 'paragraph',
        name: 'summary',
        label: 'Summary',
        disabled: true,
        defaultValue: data.summary ?? '',
        lineHeight: 10,
      },
    ],
  }),
  () => {}
);

// Add the context menu item to posts
Devvit.addMenuItem({
  label: 'ViralSense',
  location: 'post',
  onPress: async (event, context) => {
    const { reddit, ui } = context;
    const postId = event.targetId;

    if (!postId) {
      ui.showToast('Could not find post ID.');
      return;
    }

    ui.showToast('Generating summary...');

    try {
      const post = await reddit.getPostById(postId);
      const postData = post as RedditPost & Record<string, any>;
      const title = postData.title ?? postData.link_title ?? postData.linkTitle ?? postData.selftext ?? '';
      const content = postData.selftext ?? postData.body ?? postData.text ?? postData.content ?? '';
      const summaryData = await generateAISummary(title, content);
      ui.showForm(shortPostForm, {
        title,
        summary: summaryData.summary,
      });
    } catch (err) {
      console.error('Error generating summary:', err);
      ui.showToast('Failed to generate summary.');
    }
  },
});





Devvit.addMenuItem({
  label: 'Summarize Article',
  location: 'subreddit',
  onPress: async (_event, context) => {
    context.ui.showForm(articleSummarizerFormKey);
  },
});

// Add the Article Summarizer Page
Devvit.addCustomPostType({
  name: 'Article Summarizer',
  description: 'Paste any article or Reddit post, then generate a concise summary and sentiment score.',
  height: 'tall',
  render: SummaryPage,
});

export default Devvit;
