export default function EditorLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            {/* sticky rather than fixed: it stays visible while scrolling the page
                without needing a spacer to offset the content underneath it */}
            <div className="sticky top-0 z-50 bg-amber-400 px-6 py-1.5 text-center text-xs font-semibold tracking-widest text-stone-900 uppercase">
                Editing
            </div>
            {children}
        </>
    );
}
