import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import TextStyle from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useRef, useState } from 'react';
import './rich-text.css';

// Block-based rich-text editor built on TipTap.
//
// Drop-in replacement for the legacy contenteditable editor. Stores
// content as HTML so the rest of the app (CourseDetail, anywhere we
// dangerouslySetInnerHTML) keeps working without changes.
//
// Two modes for the parent:
//  - Pass `editorRef` (a useRef) and call `editorRef.current.getHTML()`
//     on save. Lowest-friction migration from the old DOM-ref pattern.
//  - Pass `onChange(html)` for controlled-input style. Fires on every
//     edit so it's heavier on re-renders; usually you want the ref.
//
// Image upload: pass `uploadEndpoint` + `authToken`. Toolbar's image
// button opens a file picker, POSTs to the endpoint with field "file",
// and inserts the returned URL into the document. Defaults to
// /api/upload so most callers don't need to set it.
export default function RichTextEditor({
  initialValue = '',
  onChange,
  editorRef,
  placeholder = 'Start writing - press / for blocks, type away for paragraphs.',
  uploadEndpoint = '/api/upload',
  authToken,
  minHeight = 220,
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        // We provide our own Link extension below so disable the default
        // (StarterKit doesn't ship Link, so this is just defensive).
      }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      Image.configure({
        HTMLAttributes: { class: 'rt-image' },
        allowBase64: false,
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
        alignments: ['left', 'center', 'right'],
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: initialValue || '',
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
  });

  // Expose the editor instance to the parent via the same ref pattern
  // the old editor used. Parents call editorRef.current?.getHTML() at
  // save-time without having to subscribe to every keystroke.
  useEffect(() => {
    if (editorRef) editorRef.current = editor;
  }, [editor, editorRef]);

  if (!editor) return null;

  return (
    <div className="rt-shell" style={{ minHeight: minHeight + 50 }}>
      <Toolbar editor={editor} uploadEndpoint={uploadEndpoint} authToken={authToken} />
      <div className="rt-content-wrap" style={{ minHeight }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

// ─── Toolbar ───────────────────────────────────────────────────────────
function Toolbar({ editor, uploadEndpoint, authToken }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [headingOpen, setHeadingOpen] = useState(false);

  const insertLink = () => {
    const prev = editor.getAttributes('link').href;
    const url = window.prompt('URL', prev || 'https://');
    if (url === null) return; // cancelled
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const handleImagePick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting same file
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(uploadEndpoint, {
        method: 'POST',
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
        body: form,
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || 'Upload failed');
      editor.chain().focus().setImage({ src: data.url, alt: file.name }).run();
    } catch (err) {
      console.error('Image upload error:', err);
      alert('Image upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const isActive = (name, attrs) => editor.isActive(name, attrs);

  return (
    <div className="rt-toolbar">
      {/* Heading dropdown */}
      <div className="rt-dd">
        <button
          type="button"
          className="rt-btn"
          onClick={() => setHeadingOpen(o => !o)}
          title="Block style"
        >
          {currentHeadingLabel(editor)} <span className="rt-caret">▾</span>
        </button>
        {headingOpen && (
          <div className="rt-menu" onMouseLeave={() => setHeadingOpen(false)}>
            <MenuItem onClick={() => { editor.chain().focus().setParagraph().run(); setHeadingOpen(false); }} active={isActive('paragraph')}>
              Paragraph
            </MenuItem>
            {[1, 2, 3, 4].map(level => (
              <MenuItem
                key={level}
                onClick={() => { editor.chain().focus().toggleHeading({ level }).run(); setHeadingOpen(false); }}
                active={isActive('heading', { level })}
              >
                Heading {level}
              </MenuItem>
            ))}
            <MenuItem onClick={() => { editor.chain().focus().toggleBlockquote().run(); setHeadingOpen(false); }} active={isActive('blockquote')}>
              Blockquote
            </MenuItem>
            <MenuItem onClick={() => { editor.chain().focus().toggleCodeBlock().run(); setHeadingOpen(false); }} active={isActive('codeBlock')}>
              Code block
            </MenuItem>
          </div>
        )}
      </div>

      <Sep />

      {/* Inline formatting */}
      <Btn onClick={() => editor.chain().focus().toggleBold().run()} active={isActive('bold')} title="Bold (Cmd+B)">
        <strong>B</strong>
      </Btn>
      <Btn onClick={() => editor.chain().focus().toggleItalic().run()} active={isActive('italic')} title="Italic (Cmd+I)">
        <em>I</em>
      </Btn>
      <Btn onClick={() => editor.chain().focus().toggleUnderline().run()} active={isActive('underline')} title="Underline (Cmd+U)">
        <u>U</u>
      </Btn>
      <Btn onClick={() => editor.chain().focus().toggleStrike().run()} active={isActive('strike')} title="Strikethrough">
        <s>S</s>
      </Btn>
      <Btn onClick={() => editor.chain().focus().toggleCode().run()} active={isActive('code')} title="Inline code">
        <code style={{ fontFamily: 'Menlo, monospace', fontSize: 12 }}>{'<>'}</code>
      </Btn>

      <Sep />

      {/* Color picker - brand-aware palette so coaches can't drift off-brand */}
      <div className="rt-dd">
        <button
          type="button"
          className="rt-btn"
          onClick={() => setColorOpen(o => !o)}
          title="Text color"
        >
          <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: editor.getAttributes('textStyle').color || 'currentColor', border: '1px solid var(--divider)' }} />
        </button>
        {colorOpen && (
          <div className="rt-menu rt-menu-grid" onMouseLeave={() => setColorOpen(false)}>
            {[
              ['Default',     null,       'var(--text-primary)'],
              ['Mint',        '#85FFBA',  '#85FFBA'],
              ['Accent',      '#FF9C33',  '#FF9C33'],
              ['Red',         '#FF453A',  '#FF453A'],
              ['Blue',        '#64D2FF',  '#64D2FF'],
              ['Muted',       '#9AA8BB',  '#9AA8BB'],
            ].map(([name, color, swatch]) => (
              <button
                key={name}
                type="button"
                className="rt-swatch"
                onClick={() => {
                  if (color) editor.chain().focus().setColor(color).run();
                  else editor.chain().focus().unsetColor().run();
                  setColorOpen(false);
                }}
                title={name}
              >
                <span className="rt-swatch-dot" style={{ background: swatch }} />
                <span className="rt-swatch-label">{name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <Btn onClick={() => editor.chain().focus().toggleHighlight({ color: '#FF9C33' }).run()} active={isActive('highlight')} title="Highlight">
        <span style={{ background: '#FF9C33', color: '#fff', padding: '0 4px', borderRadius: 2, fontWeight: 700 }}>H</span>
      </Btn>

      <Sep />

      {/* Lists & alignment */}
      <Btn onClick={() => editor.chain().focus().toggleBulletList().run()} active={isActive('bulletList')} title="Bullet list">
        <BulletIcon />
      </Btn>
      <Btn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={isActive('orderedList')} title="Numbered list">
        <NumberIcon />
      </Btn>

      <Sep />

      <Btn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Align left">
        <AlignIcon align="left" />
      </Btn>
      <Btn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Align center">
        <AlignIcon align="center" />
      </Btn>
      <Btn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Align right">
        <AlignIcon align="right" />
      </Btn>

      <Sep />

      {/* Embeds + structure */}
      <Btn onClick={insertLink} active={isActive('link')} title="Insert / edit link">
        <LinkIcon />
      </Btn>
      <Btn onClick={() => fileInputRef.current?.click()} title="Insert image" disabled={uploading}>
        {uploading ? <span style={{ fontSize: 11 }}>…</span> : <ImageIcon />}
      </Btn>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImagePick}
        style={{ display: 'none' }}
      />
      <Btn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Divider">
        <RuleIcon />
      </Btn>

      <Sep />

      {/* Undo / redo last so they sit at the right edge */}
      <Btn
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().chain().focus().undo().run()}
        title="Undo (Cmd+Z)"
      >
        <UndoIcon />
      </Btn>
      <Btn
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().chain().focus().redo().run()}
        title="Redo (Cmd+Shift+Z)"
      >
        <RedoIcon />
      </Btn>
    </div>
  );
}

function Btn({ onClick, active, disabled, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rt-btn${active ? ' rt-btn-active' : ''}`}
    >{children}</button>
  );
}

function MenuItem({ onClick, active, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rt-menu-item${active ? ' rt-menu-item-active' : ''}`}
    >{children}</button>
  );
}

function Sep() {
  return <span className="rt-sep" />;
}

function currentHeadingLabel(editor) {
  if (editor.isActive('heading', { level: 1 })) return 'Heading 1';
  if (editor.isActive('heading', { level: 2 })) return 'Heading 2';
  if (editor.isActive('heading', { level: 3 })) return 'Heading 3';
  if (editor.isActive('heading', { level: 4 })) return 'Heading 4';
  if (editor.isActive('blockquote')) return 'Blockquote';
  if (editor.isActive('codeBlock')) return 'Code block';
  return 'Paragraph';
}

// ─── Icons ────────────────────────────────────────────────────────────
const BulletIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1.5" fill="currentColor"/><circle cx="4" cy="12" r="1.5" fill="currentColor"/><circle cx="4" cy="18" r="1.5" fill="currentColor"/></svg>
);
const NumberIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/></svg>
);
const AlignIcon = ({ align }) => {
  const lines = align === 'left'
    ? [[3, 6, 21, 6], [3, 12, 15, 12], [3, 18, 18, 18]]
    : align === 'right'
      ? [[3, 6, 21, 6], [9, 12, 21, 12], [6, 18, 21, 18]]
      : [[3, 6, 21, 6], [6, 12, 18, 12], [4, 18, 20, 18]];
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      {lines.map(([x1, y1, x2, y2], i) => <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />)}
    </svg>
  );
};
const LinkIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
);
const ImageIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
);
const RuleIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"/></svg>
);
const UndoIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7v6h6"/><path d="M3 13a9 9 0 109-9"/></svg>
);
const RedoIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 7v6h-6"/><path d="M21 13a9 9 0 11-9-9"/></svg>
);
