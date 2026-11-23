class JobBoardEntriesStatsBlueprint < ApplicationBlueprint
  field :counts do |stats, _|
    stats[:counts]
  end
  field :this_week do |stats, _|
    stats[:this_week]
  end
  field :last_week do |stats, _|
    stats[:last_week]
  end
  field :response_rate do |stats, _|
    stats[:response_rate]
  end
  field :top_tags do |stats, _|
    stats[:top_tags]
  end
  field :responded_count do |stats, _|
    stats[:responded_count]
  end
  field :sent_count do |stats, _|
    stats[:sent_count]
  end
  field :weekly_counts do |stats, _|
    stats[:weekly_counts]
  end
  field :closing_soon do |stats, _|
    stats[:closing_soon]
  end
  field :closing_soon_count do |stats, _|
    stats[:closing_soon_count]
  end
end
