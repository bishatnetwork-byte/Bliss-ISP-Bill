/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
    Activity,
    Clock,
    Cpu,
    Server,
    Thermometer,
    Zap
} from "lucide-react";
import { useEffect, useState } from "react";
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from "recharts";
import { RouterResponse } from "@/api/foreform";
import { useRouterStatus } from "@/hooks/useRouters";

interface RouterDetailsProps {
    router: RouterResponse;
}

interface PortStatus {
    name: string;
    type: "WAN" | "LAN" | "SFP" | "Unused";
    speed: string;
    connected: boolean;
    rxRate: string;
    txRate: string;
}

interface HistoryPoint {
    time: string;
    cpu: number;
    ram: number;
    temp: number;
    voltage: number;
}

function parseBool(val: any): boolean {
    if (val === undefined || val === null) return false;
    if (typeof val === "boolean") return val;
    if (typeof val === "string") {
        const lower = val.toLowerCase().trim();
        return lower === "true" || lower === "yes" || lower === "y";
    }
    return !!val;
}

export default function RouterDetails({ router }: RouterDetailsProps) {
    const { data: statusData } = useRouterStatus(router.id);

    const isOnline = statusData?.connected ?? false;
    const cpuUsage = statusData?.system_resource?.['cpu-load'] ?? 0;
    const totalMemory = statusData?.system_resource?.['total-memory'];
    const freeMemory = statusData?.system_resource?.['free-memory'];
    const memoryUsage = totalMemory ? Math.round(((totalMemory - freeMemory) / totalMemory) * 100) : 0;
    const uptime = statusData?.system_resource?.uptime ?? 'Offline';
    const rosVersion = statusData?.system_resource?.['version'] ?? 'v7.x';
    const boardModel = statusData?.system_resource?.['board-name'] ?? router.description ?? 'MikroTik';
    const totalMemoryStr = totalMemory ? `${Math.round(totalMemory / (1024 * 1024))} MB` : '256 MB';
    const tempVal = statusData?.system_resource?.temperature ?? statusData?.system_resource?.['cpu-temperature'] ?? (isOnline ? 41 : 0);
    const voltageVal = statusData?.system_resource?.voltage ?? (isOnline ? 24.2 : 0);

    // Telemetry history state
    const [history, setHistory] = useState<HistoryPoint[]>([]);

    useEffect(() => {
        // Generate initial telemetry history matching the current values
        const initialHistory: HistoryPoint[] = [];
        const now = new Date();
        for (let i = 14; i >= 0; i--) {
            const time = new Date(now.getTime() - i * 2000);
            const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            initialHistory.push({
                time: timeStr,
                cpu: isOnline ? Math.max(2, Math.min(98, cpuUsage + Math.floor(Math.random() * 9) - 4)) : 0,
                ram: isOnline ? Math.max(5, Math.min(95, memoryUsage + Math.floor(Math.random() * 5) - 2)) : 0,
                temp: isOnline ? Math.max(10, Math.min(95, tempVal + Math.floor(Math.random() * 3) - 1)) : 0,
                voltage: isOnline ? Math.max(5, Math.min(48, Number((voltageVal + (Math.random() * 0.4 - 0.2)).toFixed(1)))) : 0
            });
        }
        setHistory(initialHistory);
    }, [router.id, isOnline, tempVal, voltageVal]);

    // Update telemetry history when statusData updates
    useEffect(() => {
        if (!isOnline) return;
        const nextTime = new Date();
        const timeStr = nextTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        setHistory(prev => {
            if (prev.length === 0) {
                return [{ time: timeStr, cpu: cpuUsage, ram: memoryUsage, temp: tempVal, voltage: voltageVal }];
            }
            return [
                ...prev.slice(Math.max(0, prev.length - 14)),
                { time: timeStr, cpu: cpuUsage, ram: memoryUsage, temp: tempVal, voltage: voltageVal }
            ];
        });
    }, [isOnline, cpuUsage, memoryUsage, tempVal, voltageVal]);

    // Map interfaces to ports
    const ports: PortStatus[] = (statusData?.interfaces && statusData.interfaces.length > 0)
        ? statusData.interfaces.map((intf: any) => {
            const rxRate = intf.rx_rate !== undefined ? formatRate(intf.rx_rate) : "0 bps";
            const txRate = intf.tx_rate !== undefined ? formatRate(intf.tx_rate) : "0 bps";
            return {
                name: intf.name || "ether",
                type: (intf.type === 'ether' ? 'LAN' : (intf.type === 'sfp' ? 'SFP' : 'LAN')) as any,
                speed: intf.speed || "1 Gbps",
                connected: parseBool(intf.running),
                rxRate,
                txRate
            };
        })
        : [
            { name: "ether1", type: "WAN", speed: "1 Gbps", connected: false, rxRate: "0 bps", txRate: "0 bps" },
            { name: "ether2", type: "LAN", speed: "1 Gbps", connected: false, rxRate: "0 bps", txRate: "0 bps" },
            { name: "ether3", type: "LAN", speed: "100 Mbps", connected: false, rxRate: "0 bps", txRate: "0 bps" },
            { name: "ether4", type: "LAN", speed: "1 Gbps", connected: false, rxRate: "0 bps", txRate: "0 bps" },
            { name: "ether5", type: "LAN", speed: "100 Mbps", connected: false, rxRate: "0 bps", txRate: "0 bps" }
        ];

    function formatRate(bytesPerSec: number) {
        if (bytesPerSec === 0) return "0 bps";
        if (bytesPerSec < 1000) return `${bytesPerSec} bps`;
        if (bytesPerSec < 1000000) return `${(bytesPerSec / 1000).toFixed(1)} Kbps`;
        return `${(bytesPerSec / 1000000).toFixed(1)} Mbps`;
    }

    // Custom compact tooltip for the telemetry area chart
    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-popover border border-border p-2 rounded text-[12px] font-mono shadow-md flex flex-col gap-1 text-popover-foreground">
                    {payload[0].payload.time && (
                        <p className="text-[12px] text-muted-foreground font-bold border-b border-border/40 pb-0.5 mb-0.5">
                            {payload[0].payload.time}
                        </p>
                    )}
                    {payload.map((pld: any) => (
                        <div key={pld.name} className="flex items-center justify-between gap-4">
                            <span className="flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: pld.color || pld.fill }} />
                                <span>{pld.name}</span>
                            </span>
                            <span className="font-bold">{pld.value}%</span>
                        </div>
                    ))}
                </div>
            );
        }
        return null;
    };

    // Custom compact tooltip for the diagnostics area chart
    const CustomDiagnosticsTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-popover border border-border p-2 rounded text-[12px] font-mono shadow-md flex flex-col gap-1 text-popover-foreground">
                    {payload[0].payload.time && (
                        <p className="text-[12px] text-muted-foreground font-bold border-b border-border/40 pb-0.5 mb-0.5">
                            {payload[0].payload.time}
                        </p>
                    )}
                    {payload.map((pld: any) => (
                        <div key={pld.name} className="flex items-center justify-between gap-4">
                            <span className="flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: pld.color || pld.fill }} />
                                <span>{pld.name}</span>
                            </span>
                            <span className="font-bold">
                                {pld.name === "Temp" ? `${pld.value} °C` : `${pld.value} V`}
                            </span>
                        </div>
                    ))}
                </div>
            );
        }
        return null;
    };

    return (
        <div className="space-y-4">

            {/* 5 KPI Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {/* Card 1: Router Name */}
                <Card className="border-indigo-500 bg-transparent rounded p-3 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between text-indigo-500 mb-1">
                            <span className="text-[12px] font-bold ">Router Name</span>
                            <Server className="w-3.5 h-3.5 text-indigo-500" />
                        </div>
                        <div className="text-xs font-bold text-foreground truncate mt-1" title={router.name}>
                            {router.name}
                        </div>
                    </div>
                </Card>

                {/* Card 2: Board Only */}
                <Card className="border  border-primary bg-transparent rounded p-3 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between text-emerald-500 mb-1">
                            <span className="text-[12px] font-bold ">Board Only</span>
                            <Cpu className="w-3.5 h-3.5 text-emerald-500" />
                        </div>
                        <div className="text-xs font-bold text-foreground truncate mt-1">
                            {boardModel.replace("MikroTik ", "")}
                        </div>
                    </div>
                </Card>

                {/* Card 3: RouterOS */}
                <Card className="border-amber-500 bg-transparent rounded p-3 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between text-amber-500 mb-1">
                            <span className="text-[12px] font-bold ">RouterOS</span>
                            <Server className="w-3.5 h-3.5 text-amber-500" />
                        </div>
                        <div className="text-xs font-bold text-foreground truncate mt-1 font-mono">
                            {rosVersion}
                        </div>
                    </div>
                </Card>

                {/* Card 4: Uptime */}
                <Card className="border-pink-500 bg-transparent rounded p-3 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between text-pink-500 mb-1">
                            <span className="text-[12px] font-bold ">Uptime</span>
                            <Clock className="w-3.5 h-3.5 text-pink-500" />
                        </div>
                        <div className="text-xs font-bold text-foreground mt-1 font-mono truncate" title={uptime}>
                            {uptime}
                        </div>
                    </div>
                </Card>

                {/* Card 5: CPU */}
                <Card className="border-rose-500 bg-transparent rounded p-3 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between text-rose-500 mb-1">
                            <span className="text-[12px] font-bold ">CPU</span>
                            <Activity className="w-3.5 h-3.5 text-rose-500" />
                        </div>
                        <div className="text-xs font-bold text-foreground mt-1">
                            {isOnline ? cpuUsage : 0}%
                        </div>
                    </div>
                </Card>
            </div>

            {/* Visual Physical Panel Representing MikroTik Port Configuration */}
            <Card className="border border-border/0 rounded text-foreground shadow-none overflow-hidden">
                <div className="bg-muted/40 border-b border-border/50 px-4 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Server className="w-3.5 h-3.5 text-primary" />
                        <span className="text-[12px] font-semibold text-black">
                            {router.name} • Front Panel
                        </span>
                    </div>
                </div>

                <CardContent className="p-3 bg-card">
                    {/* Metal Rack Enclosure styling */}
                    <div className="bg-muted/0 rounded p-2 border border-border/20 flex flex-wrap items-center gap-2">

                        {/* Port blocks */}
                        {ports.map((port) => (
                            <div
                                key={port.name}
                                className={cn(
                                    "flex flex-col items-center bg-card border p-1 rounded w-14 sm:w-16 h-16 sm:h-18 justify-between select-none transition-all relative",
                                    port.connected ? "border-border shadow-sm" : "border-border/20 opacity-40"
                                )}
                            >
                                {/* LED */}
                                <div className="absolute top-0.5 flex items-center justify-center">
                                    <div className={cn(
                                        "w-1 h-1 rounded-full transition-colors",
                                        port.connected ? (port.type === "WAN" ? "bg-emerald-500" : "bg-amber-500") : "bg-muted"
                                    )} />
                                </div>

                                {/* Physical port cage */}
                                <div className="w-9 h-6 border-2 border-border/80 rounded bg-muted/30 flex flex-col justify-end items-center mt-3 p-0.5">
                                    {/* Gold contact pins mapping */}
                                    <div className="w-full flex justify-between px-0.5 mb-0.5">
                                        {[1, 2, 3, 4, 5].map(i => (
                                            <div key={i} className="w-[1px] h-1.5 bg-amber-600/70" />
                                        ))}
                                    </div>
                                    <span className="text-[5.5px] font-bold text-muted-foreground font-mono leading-none">RJ45</span>
                                </div>

                                <div className="text-[7px] sm:text-[7.5px] font-mono font-bold text-muted-foreground tracking-tight uppercase text-center truncate w-full px-0.5" title={port.name}>
                                    {port.name}
                                </div>
                            </div>
                        ))}

                        {/* Power plug connector mock details */}
                        <div className="hidden sm:flex flex-col items-center justify-center border border-dashed border-border/80 p-1.5 rounded h-16 sm:h-18 w-16 shrink-0 ml-auto bg-muted/10">
                            <Zap className="w-3.5 h-3.5 text-amber-500" />
                            <span className="text-[7.5px] font-mono font-bold mt-0.5 text-muted-foreground">24V DC</span>
                        </div>

                    </div>

                    {/* Active Port Speeds Grid */}
                    {isOnline && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
                            {ports.filter(p => p.connected).map(p => (
                                <div key={p.name} className="bg-muted/35 border border-border/50 rounded p-1.5 flex flex-col gap-0.5">
                                    <div className="flex justify-between items-center text-[11px] sm:text-xs">
                                        <span className="font-bold text-foreground font-mono uppercase truncate mr-1" title={p.name}>{p.name}</span>
                                        <Badge className={cn(
                                            "text-[7px] py-0 px-1 border-none shrink-0",
                                            p.type === "WAN" ? "bg-emerald-500/10 text-emerald-600" : "bg-sky-500/10 text-sky-600"
                                        )}>
                                            {p.type}
                                        </Badge>
                                    </div>
                                    <div className="flex flex-col xs:flex-row xs:justify-between items-start xs:items-center text-[10px] sm:text-[11px] font-mono mt-0.5 text-muted-foreground gap-0.5">
                                        <span className="truncate">Tx: {p.txRate}</span>
                                        <span className="truncate">Rx: {p.rxRate}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Performance Charts & Hardware Diagnostics Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

                {/* Live Graph View */}
                <div className="lg:col-span-8">
                    <Card className="bg-card border border-border/50 rounded overflow-hidden h-full flex flex-col justify-between">
                        <CardHeader className="p-4 pb-2 border-b border-border/10 flex flex-row items-center justify-between shrink-0">
                            <div>
                                <CardTitle className="text-xs font-bold  text-muted-foreground">
                                    Performance Analytics
                                </CardTitle>
                                <p className="text-[12px] text-muted-foreground mt-0.5">
                                    Real-time resources telemetry comparison
                                </p>
                            </div>
                            <div className="flex items-center gap-4 text-[12px]">
                                <div className="flex items-center gap-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500/10 border border-indigo-500" />
                                    <span className="font-medium text-foreground">CPU ({isOnline ? cpuUsage : 0}%)</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/10 border border-emerald-500" />
                                    <span className="font-medium text-foreground">RAM ({isOnline ? memoryUsage : 0}%)</span>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-4 h-64 flex-1">
                            {isOnline ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="colorRam" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                        <XAxis
                                            dataKey="time"
                                            tickLine={false}
                                            axisLine={false}
                                            tick={{ fontSize: 8, fill: 'var(--muted-foreground)' }}
                                        />
                                        <YAxis
                                            domain={[0, 100]}
                                            tickLine={false}
                                            axisLine={false}
                                            tick={{ fontSize: 8, fill: 'var(--muted-foreground)' }}
                                        />
                                        <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)' }} />
                                        <Area
                                            type="monotone"
                                            dataKey="cpu"
                                            name="CPU"
                                            stroke="#6366f1"
                                            strokeWidth={1.5}
                                            fillOpacity={1}
                                            fill="url(#colorCpu)"
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="ram"
                                            name="RAM"
                                            stroke="#10b981"
                                            strokeWidth={1.5}
                                            fillOpacity={1}
                                            fill="url(#colorRam)"
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground text-xs border border-dashed border-border/50 rounded bg-muted/5">
                                    <Activity className="w-8 h-8 text-muted-foreground/30 mb-2 animate-pulse" />
                                    <span>Router is offline. Telemetry history unavailable.</span>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Hardware Diagnostic Details */}
                <div className="lg:col-span-4">
                    <Card className="bg-card border border-border/50 rounded p-4 h-full flex flex-col justify-between min-h-[300px]">
                        <div className="flex-1 flex flex-col justify-between">
                            <div>
                                <h3 className="text-xs font-bold text-muted-foreground mb-3 flex items-center gap-1.5">
                                    <Thermometer className="w-3.5 h-3.5 text-primary" />
                                    Diagnostics
                                </h3>
                                
                                <div className="grid grid-cols-3 gap-1.5 text-center mb-3">
                                    <div className="bg-muted/30 border border-border/40 rounded p-1 flex flex-col justify-center">
                                        <span className="text-[9px] text-muted-foreground font-semibold">Temp</span>
                                        <span className="text-[11px] font-bold font-mono text-amber-500 truncate">
                                            {isOnline ? `${tempVal} °C` : "Offline"}
                                        </span>
                                    </div>
                                    <div className="bg-muted/30 border border-border/40 rounded p-1 flex flex-col justify-center">
                                        <span className="text-[9px] text-muted-foreground font-semibold">Voltage</span>
                                        <span className="text-[11px] font-bold font-mono text-sky-500 truncate">
                                            {isOnline ? `${voltageVal} V` : "Offline"}
                                        </span>
                                    </div>
                                    <div className="bg-muted/30 border border-border/40 rounded p-1 flex flex-col justify-center">
                                        <span className="text-[9px] text-muted-foreground font-semibold">Memory</span>
                                        <span className="text-[11px] font-bold font-mono text-foreground truncate" title={totalMemoryStr}>
                                            {totalMemoryStr}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="h-32 flex-1 mt-2">
                                {isOnline ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={history} margin={{ top: 5, right: -10, left: -30, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15} />
                                                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                                                </linearGradient>
                                                <linearGradient id="colorVolt" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.15} />
                                                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                            <XAxis
                                                dataKey="time"
                                                tickLine={false}
                                                axisLine={false}
                                                tick={{ fontSize: 6.5, fill: 'var(--muted-foreground)' }}
                                            />
                                            <YAxis
                                                yAxisId="left"
                                                domain={[0, 100]}
                                                tickLine={false}
                                                axisLine={false}
                                                tick={{ fontSize: 6.5, fill: '#f59e0b' }}
                                            />
                                            <YAxis
                                                yAxisId="right"
                                                orientation="right"
                                                domain={[0, 40]}
                                                tickLine={false}
                                                axisLine={false}
                                                tick={{ fontSize: 6.5, fill: '#0ea5e9' }}
                                            />
                                            <Tooltip content={<CustomDiagnosticsTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)' }} />
                                            <Area
                                                yAxisId="left"
                                                type="monotone"
                                                dataKey="temp"
                                                name="Temp"
                                                stroke="#f59e0b"
                                                strokeWidth={1.5}
                                                fillOpacity={1}
                                                fill="url(#colorTemp)"
                                            />
                                            <Area
                                                yAxisId="right"
                                                type="monotone"
                                                dataKey="voltage"
                                                name="Voltage"
                                                stroke="#0ea5e9"
                                                strokeWidth={1.5}
                                                fillOpacity={1}
                                                fill="url(#colorVolt)"
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground text-[10px] border border-dashed border-border/50 rounded bg-muted/5 p-2 text-center">
                                        <Thermometer className="w-6 h-6 text-muted-foreground/30 mb-1 animate-pulse" />
                                        <span>Router is offline. Diagnostic telemetry history unavailable.</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </Card>
                </div>

            </div>

        </div>
    );
}
