// Renders markdown using the globally-loaded marked.js library
const { useMemo } = React;

function Markdown({ content }) {
  const html = useMemo(() => {
    if (!content) return "";
    try {
      marked.setOptions({ breaks: true, gfm: true });
      return marked.parse(content);
    } catch {
      return content;
    }
  }, [content]);
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />;
}
