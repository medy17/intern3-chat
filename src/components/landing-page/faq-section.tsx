"use client"

import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger
} from "@/components/ui/accordion"
import { useGSAP } from "@gsap/react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { useRef } from "react"

gsap.registerPlugin(ScrollTrigger)

export function FaqSection() {
    const sectionRef = useRef<HTMLElement>(null)

    useGSAP(
        () => {
            const scroller = document.querySelector("main")?.parentElement

            gsap.fromTo(
                ".faq-content",
                { y: 40, opacity: 0 },
                {
                    y: 0,
                    opacity: 1,
                    duration: 1,
                    ease: "power3.out",
                    scrollTrigger: {
                        trigger: sectionRef.current,
                        scroller: scroller || undefined,
                        start: "top 80%"
                    },
                    clearProps: "willChange"
                }
            )
        },
        { scope: sectionRef }
    )

    return (
        <section
            id="faq"
            ref={sectionRef}
            className="flex min-h-screen snap-start flex-col items-center justify-center bg-muted/10 px-6 py-20"
        >
            <div
                className="faq-content container mx-auto max-w-3xl"
                style={{ willChange: "transform, opacity" }}
            >
                <div className="mb-12 text-center">
                    <h2 className="mb-4 font-bold text-3xl md:text-5xl">Common Questions</h2>
                    <p className="text-lg text-muted-foreground">
                        Everything you need to know about SilkChat.
                    </p>
                </div>

                <Accordion
                    type="single"
                    collapsible
                    className="w-full rounded-xl border border-border/50 bg-background px-4 shadow-sm md:px-6"
                >
                    <AccordionItem value="item-1">
                        <AccordionTrigger className="py-6 text-left font-semibold text-lg">
                            What does BYOK mean?
                        </AccordionTrigger>
                        <AccordionContent className="pb-6 text-base text-muted-foreground leading-relaxed">
                            BYOK stands for "Bring Your Own Key". It means you can input your own
                            API keys from providers like OpenAI, Anthropic, or Google directly into
                            SilkChat.
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="item-2">
                        <AccordionTrigger className="py-6 text-left font-semibold text-lg">
                            How do Internal Credits work?
                        </AccordionTrigger>
                        <AccordionContent className="pb-6 text-base text-muted-foreground leading-relaxed">
                            If you don't want to manage multiple API keys, you can use our Internal
                            Credits. Subscribe and use any model seamlessly with generous credit
                            quotas.
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="item-3">
                        <AccordionTrigger className="py-6 text-left font-semibold text-lg">
                            Are my conversations private?
                        </AccordionTrigger>
                        <AccordionContent className="pb-6 text-base text-muted-foreground leading-relaxed">
                            Yes. With BYOK your data goes straight to the provider. We do not use
                            any user data to train models. The entire platform is open-source.
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="item-4">
                        <AccordionTrigger className="py-6 text-left font-semibold text-lg">
                            Can I import my ChatGPT history?
                        </AccordionTrigger>
                        <AccordionContent className="pb-6 text-base text-muted-foreground leading-relaxed">
                            Absolutely. Our Universal Import feature lets you upload exports from
                            ChatGPT, Claude, and other platforms.
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </div>
        </section>
    )
}
