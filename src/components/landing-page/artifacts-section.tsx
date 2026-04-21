"use client"

import { Button } from "@/components/ui/button"
import { useGSAP } from "@gsap/react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { LayoutTemplate, MousePointerClick, Terminal } from "lucide-react"
import { useRef, useState } from "react"

gsap.registerPlugin(ScrollTrigger)

export function ArtifactsSection() {
    const sectionRef = useRef<HTMLElement>(null)
    const [artifactCount, setArtifactCount] = useState(0)

    useGSAP(
        () => {
            const scroller = document.querySelector("main")?.parentElement

            gsap.fromTo(
                ".artifacts-header",
                { y: 40, opacity: 0, filter: "blur(10px)" },
                {
                    y: 0,
                    opacity: 1,
                    filter: "blur(0px)",
                    duration: 1,
                    ease: "power3.out",
                    scrollTrigger: {
                        trigger: sectionRef.current,
                        scroller: scroller || undefined,
                        start: "top 75%"
                    },
                    clearProps: "willChange"
                }
            )

            gsap.fromTo(
                ".artifacts-content",
                { y: 50, opacity: 0, scale: 0.95 },
                {
                    y: 0,
                    opacity: 1,
                    scale: 1,
                    duration: 1.2,
                    ease: "power3.out",
                    scrollTrigger: {
                        trigger: sectionRef.current,
                        scroller: scroller || undefined,
                        start: "top 65%"
                    },
                    clearProps: "willChange"
                }
            )
        },
        { scope: sectionRef }
    )

    return (
        <section
            id="artifacts"
            ref={sectionRef}
            className="flex min-h-[80vh] snap-start flex-col items-center justify-center bg-muted/5 px-6 py-20"
        >
            <div className="container mx-auto max-w-5xl">
                <div
                    className="artifacts-header mb-12 text-center"
                    style={{ willChange: "transform, opacity, filter" }}
                >
                    <h2 className="mb-4 font-bold text-3xl md:text-5xl">Code that runs.</h2>
                    <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
                        Smart Artifacts render React, HTML, and Markdown directly in the chat.{" "}
                        <br className="hidden md:block" /> Stop copy-pasting and start seeing
                        results instantly.
                    </p>
                </div>

                <div
                    className="artifacts-content mx-auto w-full overflow-hidden rounded-xl border border-border/50 bg-popover shadow-2xl"
                    style={{ willChange: "transform, opacity" }}
                >
                    <div className="grid grid-cols-1 lg:grid-cols-2">
                        {/* Left: Code */}
                        <div className="flex flex-col border-border/50 border-b bg-muted/10 lg:border-r lg:border-b-0">
                            <div className="flex items-center gap-2 border-border/50 border-b bg-muted/30 px-4 py-3">
                                <Terminal className="size-4 text-muted-foreground" />
                                <span className="font-medium text-muted-foreground text-sm">
                                    counter.tsx
                                </span>
                            </div>
                            <div className="overflow-x-auto p-6 font-mono text-muted-foreground text-sm">
                                <pre>
                                    <code className="language-tsx leading-loose">
                                        <span className="text-pink-500">export default</span>{" "}
                                        <span className="text-blue-400">function</span>{" "}
                                        <span className="text-emerald-400">Counter</span>() {"{\n"}
                                        {"  "}
                                        <span className="text-blue-400">const</span> [count,
                                        setCount] ={" "}
                                        <span className="text-purple-400">useState</span>(
                                        <span className="text-orange-400">0</span>);{"\n\n"}
                                        {"  "}
                                        <span className="text-pink-500">return</span> ({"\n"}
                                        {"    "}&lt;
                                        <span className="text-blue-400">div</span>{" "}
                                        <span className="text-emerald-400">className</span>=
                                        <span className="text-orange-400">
                                            "p-8 border rounded-xl bg-card text-center"
                                        </span>
                                        &gt;{"\n"}
                                        {"      "}&lt;
                                        <span className="text-blue-400">h2</span>{" "}
                                        <span className="text-emerald-400">className</span>=
                                        <span className="text-orange-400">
                                            "text-4xl font-bold mb-4"
                                        </span>
                                        &gt;{"\n"}
                                        {"        "}
                                        {"{"}count{"}"}
                                        {"\n"}
                                        {"      "}&lt;/
                                        <span className="text-blue-400">h2</span>&gt;{"\n"}
                                        {"      "}&lt;
                                        <span className="text-blue-400">button</span>
                                        {"\n"}
                                        {"        "}
                                        <span className="text-emerald-400">className</span>=
                                        <span className="text-orange-400">
                                            "px-6 py-2 bg-primary text-primary-foreground
                                            rounded-md"
                                        </span>
                                        {"\n"}
                                        {"        "}
                                        <span className="text-purple-400">onClick</span>={"{"}
                                        <span className="text-blue-400">() =&gt;</span> setCount(c{" "}
                                        <span className="text-pink-500">=&gt;</span> c +{" "}
                                        <span className="text-orange-400">1</span>){"}"}
                                        {"\n"}
                                        {"      "}&gt;{"\n"}
                                        {"        "}Increment{"\n"}
                                        {"      "}&lt;/
                                        <span className="text-blue-400">button</span>&gt;
                                        {"\n"}
                                        {"    "}&lt;/
                                        <span className="text-blue-400">div</span>&gt;{"\n"}
                                        {"  "});{"\n"}
                                        {"}"}
                                    </code>
                                </pre>
                            </div>
                        </div>

                        {/* Right: Preview */}
                        <div className="flex flex-col bg-background">
                            <div className="flex items-center justify-between border-border/50 border-b bg-muted/30 px-4 py-3">
                                <div className="flex items-center gap-2">
                                    <LayoutTemplate className="size-4 text-primary" />
                                    <span className="font-medium text-sm">Preview</span>
                                </div>
                            </div>
                            <div className="flex h-full items-center justify-center bg-[url('../../noise.png')] p-8">
                                <div className="flex w-full max-w-[280px] flex-col items-center justify-center rounded-xl border border-border/60 bg-card p-8 text-card-foreground shadow-lg transition-all hover:shadow-xl">
                                    <h2 className="mb-6 font-bold text-5xl tabular-nums tracking-tight">
                                        {artifactCount}
                                    </h2>
                                    <Button
                                        size="lg"
                                        className="w-full gap-2 font-semibold transition-transform active:scale-95"
                                        onClick={() => setArtifactCount((c) => c + 1)}
                                    >
                                        <MousePointerClick className="size-4" />
                                        Increment
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}
