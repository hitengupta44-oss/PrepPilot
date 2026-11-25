import type { Metadata } from 'next';
import Link from 'next/link';
import { ContactLine, LegalPage } from '@/components/LegalPage';
import { SITE } from '@/lib/site';

export const metadata: Metadata = { title: `Privacy Policy · ${SITE.name}` };

export default function PrivacyPage() {
  const n = SITE.name;
  return (
    <LegalPage title="Privacy Policy">
      <p>
        This policy explains what {n} collects, why, where it goes, and the choices you have. It should be read together with
        our <Link href="/terms">Terms &amp; Conditions</Link>.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><b>Account:</b> your email address, used to sign you in with a one-time code.</li>
        <li><b>Resume data:</b> the structured information extracted from your resume: name, target role, education,
          experience, projects, skills, certifications, achievements, public profile links (e.g. LinkedIn, GitHub, Behance),
          and the AI&apos;s resume score and suggestions. We do <b>not</b> store the original file, and we remove email addresses
          and phone numbers from the extracted data.</li>
        <li><b>Interview data:</b> the questions asked, the text transcript of your answers, scores, rubric scores, feedback,
          focus score, and integrity events (such as &quot;no face visible&quot; or &quot;switched tab&quot;) with timestamps.</li>
        <li><b>Study data:</b> your roadmap progress, saved question bank and coach chat messages.</li>
        <li><b>Consent record:</b> when you accepted the Terms and this policy.</li>
      </ul>

      <h2>What we do not collect</h2>
      <ul>
        <li><b>Video or images.</b> Camera frames are analyzed on your device and are never uploaded. Optional recordings stay
          in your browser and are only offered to you as a download.</li>
        <li><b>Audio.</b> We do not store audio. Your browser&apos;s speech service converts speech to text, and only the text
          reaches us.</li>
        <li>Payment details, or contact details from your resume.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To build your profile, generate questions, evaluate answers and show your progress.</li>
        <li>To find weak topics and choose future questions and roadmap items.</li>
        <li>To keep the Service secure and prevent abuse (for example, rate limiting).</li>
      </ul>
      <p>We do not sell your data, use it for advertising, or share it with employers.</p>

      <h2>Who processes it</h2>
      <ul>
        <li><b>Supabase:</b> stores your account and data. Row-level security means only your signed-in account can read
          your records.</li>
        <li><b>Groq:</b> processes resume text, questions, your answer text and chat messages to generate AI responses.</li>
        <li><b>Hugging Face:</b> hosts our backend, which passes requests between the app and the AI provider.</li>
        <li><b>Vercel:</b> hosts the website.</li>
        <li><b>Your browser&apos;s speech provider</b> (for example Google, in Chrome) processes your voice to produce a
          transcript, under that provider&apos;s own privacy terms.</li>
      </ul>
      <p>These providers may process data in countries other than yours.</p>

      <h2>How long we keep it</h2>
      <p>
        We keep your data while your account is in use. You can delete it at any time from <b>Settings → Delete all my
        data</b>, which removes your profile, resumes, interviews, answers, roadmap, question bank and chats. Contact us to
        have your sign-in account removed as well.
      </p>

      <h2>Your rights</h2>
      <p>
        You can view your data in the app, correct your profile, delete your data, and withdraw consent by deleting your data
        and no longer using the Service. Depending on where you live, you may have further rights (such as access or
        portability), which you can exercise by contacting us.
      </p>

      <h2>Children</h2>
      <p>
        The Service is not intended for anyone under {SITE.minimumAge}. If you believe a younger person has used it, contact
        us and we will delete their data.
      </p>

      <h2>Security</h2>
      <p>
        Data is sent over encrypted connections. AI keys are kept on the server and never exposed to the browser. No system is
        perfectly secure, so please use a secure email account.
      </p>

      <h2>Changes and contact</h2>
      <p>
        We will update the &quot;Last updated&quot; date when this policy changes. For privacy questions or requests, contact us{' '}
        <ContactLine />.
      </p>
    </LegalPage>
  );
}
