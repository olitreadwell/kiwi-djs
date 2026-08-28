import { OptOutForm } from '@/components/opt-out-form';

export const metadata = { title: 'Opt out — Wellington DJs' };

export default function OptOutPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 text-center">
      <h1 className="text-3xl font-black text-stone-100">Remove your profile</h1>
      <p className="mx-auto mt-4 max-w-lg text-stone-400">
        This directory only uses public data. If you&apos;re a DJ and you&apos;d rather not be listed, enter your page id below and
        your profile will be hidden from the directory.
      </p>
      <div className="mt-10">
        <OptOutForm />
      </div>
    </div>
  );
}
