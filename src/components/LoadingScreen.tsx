export default function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
      <div className="w-12 h-12 rounded-full border-4 border-primary-200 border-t-primary-600 animate-spin" />
      <p className="mt-4 text-sm text-slate-500">Loading FieldTrack...</p>
    </div>
  );
}