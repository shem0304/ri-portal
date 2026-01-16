import React from 'react';
import * as d3 from 'd3';

export type CoocNode = { id: string; size: number };
export type CoocLink = { source: string; target: string; weight: number };

type SimNode = d3.SimulationNodeDatum & CoocNode;
type SimLink = d3.SimulationLinkDatum<SimNode> & { weight: number };

export function CoocNetwork({
  nodes,
  links,
  height = 420,
  onNodeClick,
}: {
  nodes: CoocNode[];
  links: CoocLink[];
  height?: number;
  onNodeClick?: (id: string) => void;
}) {
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = React.useState(0);

  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w = e.contentRect.width;
        if (w && Math.abs(w - width) > 1) setWidth(w);
      }
    });
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width || 0);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !width || nodes.length === 0) return;

    const w = Math.floor(width);
    const h = Math.floor(height);

    const sel = d3.select(svg);
    sel.selectAll('*').remove();

    const maxSize = d3.max(nodes, (d) => d.size) || 1;
    const maxW = d3.max(links, (d) => d.weight) || 1;

    const nodeData: SimNode[] = nodes.map((n) => ({ ...n }));
    const linkData: SimLink[] = links.map((l) => ({
      source: l.source,
      target: l.target,
      weight: l.weight,
    })) as any;

    const g = sel
      .attr('viewBox', `0 0 ${w} ${h}`)
      .append('g')
      .attr('transform', 'translate(0,0)');

    const link = g
      .append('g')
      .attr('opacity', 0.35)
      .selectAll('line')
      .data(linkData)
      .enter()
      .append('line')
      .attr('stroke', 'currentColor')
      .attr('stroke-width', (d) => 0.5 + 2.5 * (d.weight / maxW));

    const node = g
      .append('g')
      .selectAll('g')
      .data(nodeData)
      .enter()
      .append('g')
      .style('cursor', onNodeClick ? 'pointer' : 'default')
      .on('click', (_, d) => onNodeClick?.(d.id));

    node
      .append('circle')
      .attr('r', (d) => 4 + 18 * (d.size / maxSize))
      .attr('fill', 'currentColor')
      .attr('opacity', 0.85);

    node
      .append('text')
      .text((d) => d.id)
      .attr('font-size', 12)
      .attr('dx', 10)
      .attr('dy', 4)
      .attr('opacity', 0.85);

    const sim = d3
      .forceSimulation(nodeData)
      .force('link', d3.forceLink(linkData).id((d: any) => d.id).distance(80).strength(0.6))
      .force('charge', d3.forceManyBody().strength(-160))
      .force('center', d3.forceCenter(w / 2, h / 2))
      .force('collide', d3.forceCollide().radius((d: any) => 8 + 16 * (d.size / maxSize)))
      .on('tick', () => {
        link
          .attr('x1', (d: any) => (d.source as any).x)
          .attr('y1', (d: any) => (d.source as any).y)
          .attr('x2', (d: any) => (d.target as any).x)
          .attr('y2', (d: any) => (d.target as any).y);

        node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
      });

    return () => {
      sim.stop();
    };
  }, [nodes, links, width, height, onNodeClick]);

  return (
    <div ref={wrapRef} style={{ width: '100%', height }}>
      <svg ref={svgRef} width="100%" height="100%" />
    </div>
  );
}
