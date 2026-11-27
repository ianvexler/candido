module CvContent
  # Content as it was written, before items got their ids.
  def without_item_ids(html)
    html.gsub(/ data-cv-item="[^"]*"/, "")
  end
end

RSpec.configure do |config|
  config.include CvContent
end
