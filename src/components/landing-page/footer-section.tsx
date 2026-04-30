import { LogoMark } from "@/components/logo"
import { Link } from "@tanstack/react-router"

export function FooterSection() {
    return (
        <footer className="snap-start border-border/40 border-t bg-muted/30 py-12">
            <div className="container mx-auto flex flex-col items-center justify-between gap-6 px-6 md:flex-row">
                <div className="flex items-center gap-2">
                    <LogoMark className="h-auto w-24" />
                </div>
                <p className="text-muted-foreground text-sm">
                    &copy; {new Date().getFullYear()} SilkChat. All rights reserved.
                </p>
                <div className="flex gap-6">
                    <Link
                        to="/terms-of-service"
                        className="text-muted-foreground text-sm hover:text-foreground"
                    >
                        Terms
                    </Link>
                    <Link
                        to="/privacy-policy"
                        className="text-muted-foreground text-sm hover:text-foreground"
                    >
                        Privacy
                    </Link>
                    <a
                        href="https://github.com/silkchat/silkchat"
                        className="text-muted-foreground text-sm hover:text-foreground"
                    >
                        GitHub
                    </a>
                </div>
            </div>
        </footer>
    )
}
