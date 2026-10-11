"use client";

import { Area, AreaChart, YAxis } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";

const CONFIG: ChartConfig = { revenue: { color: "var(--chart-1)" } };

/** Daily net revenue as a small trend line. The figure beside it carries the number. */
export function RevenueSparkline({ values, label }: { values: number[]; label: string }) {
  const data = values.map((revenue, day) => ({ day, revenue }));
  return (
    <ChartContainer
      config={CONFIG}
      role="img"
      aria-label={label}
      className="aspect-auto h-10 w-full"
      initialDimension={{ width: 240, height: 40 }}
    >
      <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
        <YAxis hide domain={[0, "dataMax"]} />
        <Area
          dataKey="revenue"
          type="linear"
          stroke="var(--color-revenue)"
          strokeWidth={1.5}
          fill="var(--color-revenue)"
          fillOpacity={0.12}
          isAnimationActive={false}
          dot={false}
          activeDot={false}
        />
      </AreaChart>
    </ChartContainer>
  );
}
