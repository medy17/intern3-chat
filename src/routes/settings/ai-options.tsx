import { MCPServersCard } from "@/components/settings/mcp-servers-card"
import { SearchProviderCard } from "@/components/settings/search-provider-card"
import { SettingsLayout } from "@/components/settings/settings-layout"
import { SupermemoryCard } from "@/components/settings/supermemory-card"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { api } from "@/convex/_generated/api"
import type { MCPServerConfig } from "@/convex/schema/settings"
import { useSession } from "@/hooks/auth-hooks"
import { SEARCH_PROVIDERS } from "@/lib/models-providers-shared"
import { useConvexMutation, useConvexQuery } from "@convex-dev/react-query"
import { createFileRoute } from "@tanstack/react-router"
import type { Infer } from "convex/values"
import { useState } from "react"
import { toast } from "sonner"

export const Route = createFileRoute("/settings/ai-options")({
    component: AIOptionsSettings
})

type SearchProvider = "firecrawl" | "brave" | "tavily" | "serper"
type SearchProviderAvailability = Record<
    SearchProvider,
    {
        available: boolean
        byok: boolean
        deployment: boolean
    }
>

const getProviderStatus = (
    providerId: SearchProvider,
    availability: SearchProviderAvailability | null | undefined
) => {
    const providerAvailability = availability?.[providerId]
    if (!providerAvailability?.available) return "Not configured"
    if (providerAvailability.byok) return "BYOK"
    if (providerAvailability.deployment) return "Server"
    return "Not configured"
}

function AIOptionsSettings() {
    const session = useSession()
    const [isLoading, setIsLoading] = useState(false)

    const userSettings = useConvexQuery(
        api.settings.getUserSettings,
        session.user?.id ? {} : "skip"
    )
    const searchProviderAvailability = useConvexQuery(
        api.settings.getSearchProviderAvailability,
        session.user?.id ? {} : "skip"
    ) as SearchProviderAvailability | null | undefined

    const updateSettings = useConvexMutation(api.settings.updateUserSettingsPartial)

    if (!session.user?.id || !userSettings) return null

    const handleSearchProviderChange = async (provider: SearchProvider) => {
        if (provider === userSettings.searchProvider) return
        if (!session.user) return
        if (!searchProviderAvailability?.[provider]?.available) {
            toast.error("Configure this search provider before selecting it")
            return
        }

        setIsLoading(true)
        try {
            await updateSettings({ searchProvider: provider })
            toast.success("Search provider updated")
        } catch (error) {
            toast.error("Failed to update search provider")
            console.error(error)
        } finally {
            setIsLoading(false)
        }
    }

    const handleIncludeSourcesToggle = async (includeSourcesByDefault: boolean) => {
        if (!session.user) return

        setIsLoading(true)
        try {
            await updateSettings({
                searchIncludeSourcesByDefault: includeSourcesByDefault
            })
            toast.success(
                `Search sources ${includeSourcesByDefault ? "enabled" : "disabled"} by default`
            )
        } catch (error) {
            toast.error("Failed to update search sources setting")
            console.error(error)
        } finally {
            setIsLoading(false)
        }
    }

    const handleSupermemoryUpdate = async (enabled: boolean, newKey?: string) => {
        if (!session.user) return

        setIsLoading(true)
        try {
            await updateSettings({
                generalProviderUpdates: {
                    supermemory: { enabled, newKey }
                }
            })
            toast.success(`Supermemory ${enabled ? "enabled" : "disabled"}`)
        } catch (error) {
            toast.error("Failed to update Supermemory settings")
            console.error(error)
            throw error
        } finally {
            setIsLoading(false)
        }
    }

    const handleMCPServersUpdate = async (servers: Infer<typeof MCPServerConfig>[]) => {
        if (!session.user) return

        setIsLoading(true)
        try {
            await updateSettings({ mcpServers: servers })
            toast.success("MCP servers updated")
        } catch (error) {
            toast.error("Failed to update MCP servers")
            console.error(error)
            throw error
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <SettingsLayout
            title="AI Options"
            description="Configure AI search, memory, and web search preferences."
        >
            <div className="space-y-8">
                {/* Supermemory Section */}
                <div className="space-y-4">
                    <div>
                        <h3 className="font-semibold text-foreground">AI Memory</h3>
                        <p className="mt-1 text-muted-foreground text-sm">
                            Store and retrieve information across conversations for enhanced AI
                            context
                        </p>
                    </div>

                    <SupermemoryCard
                        userSettings={userSettings}
                        onSave={handleSupermemoryUpdate}
                        loading={isLoading}
                    />
                </div>

                {/* MCP Servers Section */}
                <MCPServersCard
                    userSettings={userSettings}
                    onSave={handleMCPServersUpdate}
                    loading={isLoading}
                />

                {/* Search Provider Section */}
                <div className="space-y-4">
                    <div>
                        <h3 className="font-semibold text-foreground">Web Search Provider</h3>
                        <p className="mt-1 text-muted-foreground text-sm">
                            Choose which service to use for web searches. BYOK providers take
                            priority over server providers. Configure BYOK keys on the{" "}
                            <a href="/settings/providers" className="text-primary underline">
                                Providers page
                            </a>
                            .
                        </p>
                    </div>

                    <div className="grid max-w-4xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2">
                        {SEARCH_PROVIDERS.map((providerInfo) => {
                            const providerId = providerInfo.id as SearchProvider
                            const providerAvailability = searchProviderAvailability?.[providerId]
                            const isAvailable = providerAvailability?.available === true
                            const status = getProviderStatus(providerId, searchProviderAvailability)

                            return (
                                <SearchProviderCard
                                    key={providerId}
                                    provider={providerId}
                                    isSelected={userSettings.searchProvider === providerId}
                                    onSelect={handleSearchProviderChange}
                                    title={`${providerInfo.name} ${status !== "Not configured" ? `(${status})` : ""}`}
                                    description={providerInfo.description}
                                    disabled={!isAvailable}
                                    statusText={
                                        isAvailable
                                            ? `Available through ${status}.`
                                            : "Configure a BYOK key before selecting this provider."
                                    }
                                />
                            )
                        })}
                    </div>
                </div>

                {/* Search Sources Section */}
                <div className="space-y-4">
                    <div>
                        <h3 className="font-semibold text-foreground">Search Sources</h3>
                        <p className="mt-1 text-muted-foreground text-sm">
                            Control whether to include source information in search results by
                            default
                        </p>
                    </div>

                    <Card className="p-4">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label className="text-base">Include Sources by Default</Label>
                                <div className="text-muted-foreground text-sm">
                                    Automatically include source links and citations in search
                                    responses
                                </div>
                            </div>
                            <Switch
                                checked={userSettings.searchIncludeSourcesByDefault}
                                onCheckedChange={handleIncludeSourcesToggle}
                                disabled={isLoading}
                            />
                        </div>
                    </Card>
                </div>
            </div>
        </SettingsLayout>
    )
}
