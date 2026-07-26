import type { Metadata } from 'next';

import 'katex/dist/katex.min.css';

import HowItWorksExperience from '../../components/how-it-works-experience';

import '../how-it-works.css';

export const metadata: Metadata = {
  title: 'How It Works | The Last Alibi',
  description:
    'A 60-second briefing and technical deep dive into The Last Alibi’s committed mystery, bounded disclosures, and private binary verdict design.',
};

export default function HowItWorksPage() {
  return <HowItWorksExperience />;
}
