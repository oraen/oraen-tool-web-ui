export type DiagramKind = "mermaid" | "plantuml" | "dot" | "nomnoml";
export const diagramNames: Record<DiagramKind, string> = {
  mermaid: "Mermaid",
  plantuml: "PlantUML",
  dot: "Graphviz / DOT",
  nomnoml: "nomnoml",
};
export function diagramKind(language: string): DiagramKind | undefined {
  return (
    {
      mermaid: "mermaid",
      mmd: "mermaid",
      plantuml: "plantuml",
      puml: "plantuml",
      uml: "plantuml",
      dot: "dot",
      graphviz: "dot",
      nomnoml: "nomnoml",
    } as Record<string, DiagramKind>
  )[language.toLowerCase()];
}
export const MAX_DIAGRAM_SOURCE = 40000;
