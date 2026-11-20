# Sections now store their editor HTML in a single `content` column instead of
# one row per line. Existing items are folded into HTML before the item tables go.
class MoveSectionItemsIntoContent < ActiveRecord::Migration[8.0]
  LIST_TAGS = { "bullet" => "ul", "ordered" => "ol" }.freeze

  def up
    add_column :section_templates, :content, :text, null: false, default: ""
    add_column :curriculum_sections, :content, :text, null: false, default: ""

    backfill(:section_templates, :section_template_items, :section_template_id)
    backfill(:curriculum_sections, :curriculum_section_items, :curriculum_section_id)

    drop_table :section_template_items
    drop_table :curriculum_section_items
  end

  def down
    create_item_table(:section_template_items, :section_template)
    create_item_table(:curriculum_section_items, :curriculum_section)

    remove_column :section_templates, :content
    remove_column :curriculum_sections, :content
  end

  private

  def backfill(parent_table, item_table, foreign_key)
    rows = select_all(<<~SQL).to_a
      SELECT #{foreign_key} AS parent_id, kind, body, hidden
      FROM #{item_table}
      ORDER BY #{foreign_key}, position, id
    SQL

    rows.group_by { |row| row["parent_id"] }.each do |parent_id, items|
      execute(<<~SQL)
        UPDATE #{parent_table}
        SET content = #{quote(items_to_html(items))}
        WHERE id = #{Integer(parent_id)}
      SQL
    end
  end

  def items_to_html(items)
    items.chunk_while { |a, b| LIST_TAGS.key?(a["kind"]) && a["kind"] == b["kind"] }.map do |group|
      tag = LIST_TAGS[group.first["kind"]]
      if tag
        "<#{tag}>#{group.map { |item| "<li><p>#{inner(item)}</p></li>" }.join}</#{tag}>"
      elsif group.first["kind"] == "heading"
        "<h3>#{inner(group.first)}</h3>"
      else
        "<p>#{inner(group.first)}</p>"
      end
    end.join
  end

  def inner(item)
    body = item["body"].to_s
    hidden = ActiveModel::Type::Boolean.new.cast(item["hidden"])
    return body unless hidden && !body.include?("data-cv-hidden")

    %(<span data-cv-hidden="true">#{body}</span>)
  end

  def create_item_table(table, parent)
    create_table table do |t|
      t.references parent, null: false, foreign_key: true
      t.string :kind, null: false, default: "bullet"
      t.text :body, null: false
      t.integer :position, null: false, default: 0
      t.boolean :hidden, null: false, default: false

      t.timestamps
    end

    add_index table, [ :"#{parent}_id", :position ]
  end
end
