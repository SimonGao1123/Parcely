import HomeNavbar from "@/components/homeNavbar";

export default function MainLayout({ children }: { children: React.ReactNode }) {
    return (
        // pt clears the fixed navbar so content doesn't start underneath it
        <div className="pt-14">
            <HomeNavbar />
            {children}
        </div>
    )
}