import type { FC } from 'react';

interface TagFilterProps {
  tags: string[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onClearAll: () => void;
}

const TagFilter: FC<TagFilterProps> = ({ tags, selectedTags, onToggleTag, onClearAll }) => {
  if (tags.length === 0) return null;

  return (
    <div className="tag-filter" role="group" aria-label="Filter bookmarks by tag">
      <span className="tag-filter__label" id="tag-filter-label">
        Filter by tag:
      </span>
      <div className="tag-filter__list" role="list" aria-labelledby="tag-filter-label">
        {tags.map((tag) => {
          const isSelected = selectedTags.includes(tag);
          return (
            <div key={tag} role="listitem">
              <button
                className={`tag-filter__tag${isSelected ? ' tag-filter__tag--active' : ''}`}
                onClick={() => onToggleTag(tag)}
                aria-pressed={isSelected}
                aria-label={`Filter by tag: ${tag}${isSelected ? ' (active)' : ''}`}
              >
                {tag}
              </button>
            </div>
          );
        })}
      </div>
      {selectedTags.length > 0 && (
        <button
          className="tag-filter__clear"
          onClick={onClearAll}
          aria-label="Clear all tag filters"
        >
          Clear filters
        </button>
      )}
    </div>
  );
};

export default TagFilter;
