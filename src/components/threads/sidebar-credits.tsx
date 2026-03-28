import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { Crown, KeyRound, Wallet } from "lucide-react"

export type PrototypeCreditSummary = {
    enabled: boolean
    plan: "free" | "pro"
    periodKey: string
    periodStartsAt: number
    periodEndsAt: number
    basic: {
        limit: number
        used: number
        remaining: number
    }
    pro: {
        limit: number
        used: number
        remaining: number
    }
    requestCounts: {
        internal: number
        byok: number
        total: number
    }
}

function PrototypeCreditsGroup({ summary }: { summary: PrototypeCreditSummary }) {
    if (!summary.enabled) return null

    const basicProgress =
        summary.basic.limit > 0 ? (summary.basic.used / summary.basic.limit) * 100 : 0
    const proProgress = summary.pro.limit > 0 ? (summary.pro.used / summary.pro.limit) * 100 : 0
    const PlanIcon = summary.plan === "pro" ? Crown : Wallet

    return (
        <SidebarGroup>
            <SidebarGroupLabel>Credits</SidebarGroupLabel>
            <SidebarGroupContent>
                <div className="rounded-md border bg-sidebar-accent/20 px-3 py-3">
                    <div className="flex items-center gap-2">
                        <PlanIcon className="h-4 w-4 shrink-0" />
                        <div className="font-medium text-sm">
                            {summary.plan === "pro" ? "Pro Plan" : "Free Plan"}
                        </div>
                    </div>

                    <div className="mt-3 space-y-3">
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">Basic</span>
                                <span>
                                    {summary.basic.used}/{summary.basic.limit}
                                </span>
                            </div>
                            <Progress value={basicProgress} className="h-1.5" />
                        </div>

                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">Pro</span>
                                <span>
                                    {summary.pro.used}/{summary.pro.limit}
                                </span>
                            </div>
                            <Progress value={proProgress} className="h-1.5" />
                        </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-muted-foreground text-xs">
                        <span>{summary.requestCounts.internal} internal</span>
                        <span className="inline-flex items-center gap-1">
                            <KeyRound className="h-3 w-3" />
                            {summary.requestCounts.byok} BYOK
                        </span>
                    </div>
                </div>
            </SidebarGroupContent>
        </SidebarGroup>
    )
}

export function PrototypeCreditsLoadingGroup() {
    return (
        <SidebarGroup>
            <SidebarGroupLabel>Credits</SidebarGroupLabel>
            <SidebarGroupContent>
                <div className="rounded-md border bg-sidebar-accent/20 px-3 py-3">
                    <div className="flex items-center gap-2">
                        <Skeleton className="h-4 w-4 shrink-0" />
                        <Skeleton className="h-4 w-20" />
                    </div>

                    <div className="mt-3 space-y-3">
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <Skeleton className="h-3 w-10" />
                                <Skeleton className="h-3 w-12" />
                            </div>
                            <Skeleton className="h-1.5 w-full" />
                        </div>

                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <Skeleton className="h-3 w-10" />
                                <Skeleton className="h-3 w-12" />
                            </div>
                            <Skeleton className="h-1.5 w-full" />
                        </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="h-3 w-16" />
                    </div>
                </div>
            </SidebarGroupContent>
        </SidebarGroup>
    )
}

function PrototypeCreditPlanToggle({
    plan,
    disabled,
    onSetCreditPlan
}: {
    plan: PrototypeCreditSummary["plan"]
    disabled: boolean
    onSetCreditPlan: (plan: "free" | "pro") => Promise<void>
}) {
    return (
        <div className="px-2">
            <div className="flex gap-2">
                <Button
                    size="sm"
                    variant={plan === "free" ? "default" : "outline"}
                    className="h-7 flex-1"
                    disabled={disabled}
                    onClick={() => void onSetCreditPlan("free")}
                >
                    Free
                </Button>
                <Button
                    size="sm"
                    variant={plan === "pro" ? "default" : "outline"}
                    className="h-7 flex-1"
                    disabled={disabled}
                    onClick={() => void onSetCreditPlan("pro")}
                >
                    Pro
                </Button>
            </div>
        </div>
    )
}

export function PrototypeCreditsSection({
    shouldShow,
    summary,
    shouldShowDevCreditPlanToggle,
    isUpdatingCreditPlan,
    onSetCreditPlan
}: {
    shouldShow: boolean
    summary: PrototypeCreditSummary | null
    shouldShowDevCreditPlanToggle: boolean
    isUpdatingCreditPlan: boolean
    onSetCreditPlan: (plan: "free" | "pro") => Promise<void>
}) {
    if (!shouldShow) return null

    if (!summary) {
        return <PrototypeCreditsLoadingGroup />
    }

    return (
        <div className="space-y-2">
            <PrototypeCreditsGroup summary={summary} />
            {shouldShowDevCreditPlanToggle && (
                <PrototypeCreditPlanToggle
                    plan={summary.plan}
                    disabled={isUpdatingCreditPlan}
                    onSetCreditPlan={onSetCreditPlan}
                />
            )}
        </div>
    )
}
