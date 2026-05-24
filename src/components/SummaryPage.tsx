import { Devvit } from '@devvit/public-api';

type ArticleSummarizerFormData = {
  title?: string;
  article?: string;
};

const articleSummarizerResultFormKey = Devvit.createForm(
  (data: ArticleSummarizerFormData) => ({
    title: 'ViralSense Summary',
    acceptLabel: 'Close',
    fields: [
      {
        type: 'string',
        name: 'title',
        label: 'Title',
        disabled: true,
        defaultValue: data.title ?? '',
        helpText: '',
      },
      {
        type: 'string',
        name: 'summary',
        label: 'Summary',
        disabled: true,
        defaultValue: data.summary ?? '',
        helpText: '',
        lines: 8,
        placeholder: '',
      },
    ],
  }),
  () => {}
);

export const articleSummarizerFormKey = Devvit.createForm(
  {
    title: 'ViralSense',
    description: 'Paste text and generate a short summary.',
    acceptLabel: 'Summarize',
    cancelLabel: 'Cancel',
    fields: [
      {
        type: 'string',
        name: 'title',
        label: 'Title',
        required: false,
      },
      {
        type: 'paragraph',
        name: 'article',
        label: 'Description',
        required: true,
      },
    ],
  },
  async (event, context) => {
    const { title, article } = event.values as ArticleSummarizerFormData;
    const text = String(article ?? '').trim();

    if (!text) {
      context.ui.showToast('Please enter text before summarizing.');
      return;
    }

    context.ui.showToast('Generating summary...');
    const { generateAISummary } = await import('../core/nuke.js');
    const summaryData = await generateAISummary(String(title ?? ''), text);

    context.ui.showForm(articleSummarizerResultFormKey, {
      title: title ?? 'Untitled',
      summary: summaryData.summary,
      sentiment: summaryData.sentiment ?? '',
    });
  }
);

export const SummaryPage = (context: Devvit.Context) => (
  <vstack grow padding="medium" gap="medium">
    <text size="xxlarge" weight="bold">ViralSense</text>
    <text wrap>Open a simple popup to summarize text.</text>
    <button appearance="primary" onPress={() => context.ui.showForm(articleSummarizerFormKey)}>
      Open Popup
    </button>
  </vstack>
);
