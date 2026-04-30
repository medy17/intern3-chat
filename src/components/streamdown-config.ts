import { cn } from "@/lib/utils"
import { code } from "@streamdown/code"
import { math } from "@streamdown/math"
import type React from "react"
import { createElement } from "react"
import type { Components, ExtraProps, PluginConfig } from "streamdown"
import { Codeblock } from "./codeblock"

export const streamdownPlugins: PluginConfig = {
    code,
    math
}

const Table = ({
    className,
    node: _node,
    ...props
}: React.JSX.IntrinsicElements["table"] & ExtraProps) =>
    createElement(
        "div",
        { className: "my-4 overflow-x-auto" },
        createElement("table", {
            className: cn(
                "w-full border-collapse overflow-hidden rounded-lg border border-border",
                className
            ),
            ...props
        })
    )

const TableHead = ({
    className,
    node: _node,
    ...props
}: React.JSX.IntrinsicElements["thead"] & ExtraProps) =>
    createElement("thead", { className: cn("bg-muted/80", className), ...props })

const TableBody = ({
    className,
    node: _node,
    ...props
}: React.JSX.IntrinsicElements["tbody"] & ExtraProps) =>
    createElement("tbody", { className: cn("divide-y divide-border", className), ...props })

const TableRow = ({
    className,
    node: _node,
    ...props
}: React.JSX.IntrinsicElements["tr"] & ExtraProps) =>
    createElement("tr", { className: cn("border-border align-top", className), ...props })

const TableHeadCell = ({
    className,
    node: _node,
    ...props
}: React.JSX.IntrinsicElements["th"] & ExtraProps) =>
    createElement("th", {
        className: cn(
            "whitespace-normal px-4 py-3 text-left align-top font-semibold text-sm",
            className
        ),
        ...props
    })

const TableCell = ({
    className,
    node: _node,
    ...props
}: React.JSX.IntrinsicElements["td"] & ExtraProps) =>
    createElement("td", {
        className: cn("whitespace-normal px-4 py-3 align-top text-sm", className),
        ...props
    })

export const streamdownComponents: Components = {
    code: Codeblock,
    inlineCode: Codeblock,
    table: Table,
    thead: TableHead,
    tbody: TableBody,
    tr: TableRow,
    th: TableHeadCell,
    td: TableCell
}
