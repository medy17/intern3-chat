import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getPublicR2AssetUrl } from "@/lib/r2-public-url"
import { cn } from "@/lib/utils"

const getInitials = (name: string) =>
    name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("") || "P"

export const getPersonaAvatarSrc = (avatarKind?: "builtin" | "r2", avatarValue?: string) => {
    if (!avatarKind || !avatarValue) return undefined
    if (avatarKind === "builtin") return avatarValue
    return getPublicR2AssetUrl(avatarValue)
}

export function PersonaAvatar({
    name,
    avatarKind,
    avatarValue,
    className,
    rounded = "lg"
}: {
    name: string
    avatarKind?: "builtin" | "r2"
    avatarValue?: string
    className?: string
    rounded?: "lg" | "full"
}) {
    const roundedClassName = rounded === "full" ? "rounded-full" : "rounded-lg"

    return (
        <Avatar className={cn("size-7", roundedClassName, className)}>
            <AvatarImage src={getPersonaAvatarSrc(avatarKind, avatarValue)} alt={name} />
            <AvatarFallback className={cn(roundedClassName, "text-[0.625rem]")}>
                {getInitials(name)}
            </AvatarFallback>
        </Avatar>
    )
}
