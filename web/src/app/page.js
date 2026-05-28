import dynamic from 'next/dynamic';
import Footer from 'components/Footer';

const LandingPage = dynamic(() => import('components/LandingPage'), {
  loading: () => (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  ),
});

export default function Page() {
  return (
    <>
      <LandingPage />
      <Footer />
    </>
  );
}
