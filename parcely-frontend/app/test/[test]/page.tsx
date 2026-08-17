export default async function TestPage({ params }: { params: { test: string } }) {
  const { test } = await params;
  return <div>Test Page {test}</div>;
}