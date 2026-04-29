import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import type { ImageSortOption } from "@/lib/library-search"
import { PlusCircle } from "lucide-react"
import { type ReactNode, useMemo } from "react"

const getFilterButtonLabel = ({
    emptyLabel,
    selectedValues,
    optionLabels
}: {
    emptyLabel: string
    selectedValues: string[]
    optionLabels: Map<string, string>
}) => {
    if (selectedValues.length === 0) return emptyLabel
    if (selectedValues.length === 1) {
        return optionLabels.get(selectedValues[0]) ?? selectedValues[0]
    }

    return `${selectedValues.length} selected`
}

export const MultiSelectFilter = ({
    label,
    emptyLabel,
    selectedValues,
    options,
    onToggleValue,
    onClear
}: {
    label: string
    emptyLabel: string
    selectedValues: string[]
    options: Array<{ value: string; label: string }>
    onToggleValue: (value: string) => void
    onClear: () => void
}) => {
    const optionLabelMap = useMemo(
        () => new Map(options.map((option) => [option.value, option.label])),
        [options]
    )

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    type="button"
                    variant={selectedValues.length > 0 ? "secondary" : "outline"}
                    className="h-9 border-dashed bg-background px-3 font-normal"
                >
                    <PlusCircle className="mr-2 h-4 w-4" />
                    <span className="font-medium text-foreground/80">{label}</span>
                    {selectedValues.length > 0 && (
                        <>
                            <div className="mx-2 h-4 w-[1px] shrink-0 bg-border" />
                            <span className="truncate font-medium text-secondary-foreground">
                                {getFilterButtonLabel({
                                    emptyLabel: "",
                                    selectedValues,
                                    optionLabels: optionLabelMap
                                })}
                            </span>
                        </>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel>{label}</DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                    checked={selectedValues.length === 0}
                    onSelect={(event) => event.preventDefault()}
                    onCheckedChange={() => onClear()}
                >
                    {emptyLabel}
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                {options.map((option) => (
                    <DropdownMenuCheckboxItem
                        key={option.value}
                        checked={selectedValues.includes(option.value)}
                        onSelect={(event) => event.preventDefault()}
                        onCheckedChange={() => onToggleValue(option.value)}
                    >
                        {option.label}
                    </DropdownMenuCheckboxItem>
                ))}
                {selectedValues.length > 0 && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onSelect={(event) => {
                                event.preventDefault()
                                onClear()
                            }}
                        >
                            Clear {label.toLowerCase()}
                        </DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

export const MobileFilterSection = ({
    title,
    action,
    children
}: {
    title: string
    action?: ReactNode
    children: ReactNode
}) => (
    <section className="space-y-3 border-t pt-4 first:border-t-0 first:pt-0">
        <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-base">{title}</h3>
            {action}
        </div>
        {children}
    </section>
)

export const MobileSortFilter = ({
    options,
    value,
    onChange
}: {
    options: Array<{ value: ImageSortOption; label: string }>
    value: ImageSortOption
    onChange: (value: ImageSortOption) => void
}) => (
    <MobileFilterSection title="Sort By">
        <RadioGroup value={value} onValueChange={(next) => onChange(next as ImageSortOption)}>
            {options.map((option) => (
                <label
                    key={option.value}
                    htmlFor={`mobile-sort-${option.value}`}
                    className="flex items-center gap-3 py-1.5 text-sm"
                >
                    <RadioGroupItem id={`mobile-sort-${option.value}`} value={option.value} />
                    <span>{option.label}</span>
                </label>
            ))}
        </RadioGroup>
    </MobileFilterSection>
)

export const MobileCheckboxFilter = ({
    title,
    selectedValues,
    options,
    onToggleValue,
    onClear
}: {
    title: string
    selectedValues: string[]
    options: Array<{ value: string; label: string }>
    onToggleValue: (value: string) => void
    onClear: () => void
}) => (
    <MobileFilterSection
        title={`${title}${selectedValues.length > 0 ? ` (${selectedValues.length})` : ""}`}
        action={
            selectedValues.length > 0 ? (
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2"
                    onClick={onClear}
                >
                    Clear
                </Button>
            ) : undefined
        }
    >
        <div className="space-y-3">
            {options.map((option) => (
                <label
                    key={option.value}
                    htmlFor={`${title.toLowerCase().replace(/\s+/g, "-")}-${option.value}`}
                    className="flex items-center gap-3 py-1.5 text-sm"
                >
                    <Checkbox
                        id={`${title.toLowerCase().replace(/\s+/g, "-")}-${option.value}`}
                        checked={selectedValues.includes(option.value)}
                        onCheckedChange={() => onToggleValue(option.value)}
                    />
                    <span>{option.label}</span>
                </label>
            ))}
        </div>
    </MobileFilterSection>
)
