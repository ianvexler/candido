require "rails_helper"

RSpec.describe "Curriculums" do
  let(:user) { create(:user) }
  let(:headers) { auth_headers(user) }

  describe "GET /api/v1/curriculums" do
    it "lists the current user's CVs with section counts" do
      curriculum = create(:curriculum, user: user, title: "Mine")
      curriculum.import_section_templates!(create(:section_template, user: user))
      create(:curriculum, title: "Someone else's")

      get "/api/v1/curriculums", headers: headers

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["curriculums"].map { |item| item.slice("title", "section_count") })
        .to eq([ { "title" => "Mine", "section_count" => 1 } ])
    end

    it "marks the copy a job uses as its CV" do
      job = create(:job_board_entry, user: user, number: 1)
      copy = create(:curriculum, user: user, title: "Copy", job_board_entry: job)
      master = create(:curriculum, user: user, title: "Master")
      job.use_cv_copy!(copy)

      get "/api/v1/curriculums", headers: headers

      by_title = response.parsed_body["curriculums"].index_by { |item| item["title"] }
      expect(by_title["Copy"]["cv_for_job"]).to eq("id" => job.id, "company" => job.company)
      expect(by_title["Master"]["cv_for_job"]).to be_nil
      expect(master).to be_persisted
    end

    it "says what a copy was made for and how its review stands" do
      job = create(:job_board_entry, user: user, title: "Designer", company: "Fernway", number: 1)
      source = create(:curriculum, user: user, title: "My CV")
      copy = source.duplicate_for_job!(job)
      run = create(:cv_tailoring, user: user, curriculum: copy, status: "succeeded", report: { "fit" => "partial" })
      section = copy.curriculum_sections.create!(section_type: "Experience", entries: [ { content: "<p>Led</p>" } ])
      create(:cv_tailoring_suggestion, cv_tailoring: run, curriculum_section: section)

      get "/api/v1/curriculums", headers: headers

      by_title = response.parsed_body["curriculums"].index_by { |item| item["id"] }
      expect(by_title[source.id]["tailoring"]).to be_nil
      expect(by_title[copy.id]["tailoring"]).to eq(
        "job" => { "id" => job.id, "title" => "Designer", "company" => "Fernway", "status" => "PENDING" },
        "source_title" => "My CV", "fit" => "partial", "review_status" => "succeeded", "pending_suggestions" => 1
      )
    end

    it "lists copies without a query per copy" do
      add_copy = lambda do |number|
        job = create(:job_board_entry, user: user, number: number)
        copy = create(:curriculum, user: user).duplicate_for_job!(job)
        create(:cv_tailoring, user: user, curriculum: copy, status: "succeeded", report: { "fit" => "weak" })
      end
      count_selects = lambda do
        count = 0
        counter = ->(*, payload) { count += 1 if payload[:sql].start_with?("SELECT") && payload[:name] != "SCHEMA" }
        ActiveSupport::Notifications.subscribed(counter, "sql.active_record") { get "/api/v1/curriculums", headers: headers }
        count
      end
      2.times { |i| add_copy.call(i + 1) }
      count_selects.call
      before = count_selects.call
      add_copy.call(3)

      expect(count_selects.call).to eq(before)
    end

    it "requires authentication" do
      get "/api/v1/curriculums"

      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe "POST /api/v1/curriculums" do
    it "creates a CV and imports the chosen library sections in order" do
      first = create(:section_template, user: user, title: "Experience", content: "<p>Acme</p>")
      second = create(:section_template, user: user, title: "Skills")

      post "/api/v1/curriculums",
        params: { title: "Platform roles", section_template_ids: [ second.id, first.id ] },
        headers: headers,
        as: :json

      expect(response).to have_http_status(:ok)
      body = response.parsed_body["curriculum"]
      expect(body).to include("title" => "Platform roles", "layout" => "single_column")
      expect(body["sections"].map { |section| section.slice("position", "section_template_id") }).to eq([
        { "position" => 0, "section_template_id" => second.id },
        { "position" => 1, "section_template_id" => first.id }
      ])
      expect(body["sections"].last["entries"].first).to include("content" => "<p>Acme</p>")
      expect(body["sections"].last["library_updated"]).to be(false)
    end

    it "rejects another user's library section and creates nothing" do
      foreign = create(:section_template)

      expect {
        post "/api/v1/curriculums",
          params: { title: "Sneaky", section_template_ids: [ foreign.id ] },
          headers: headers,
          as: :json
      }.not_to change(Curriculum, :count)

      expect(response).to have_http_status(:not_found)
    end

    it "requires a title" do
      post "/api/v1/curriculums", params: { title: "" }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
    end
  end

  describe "GET /api/v1/curriculums/:id" do
    it "forbids another user's CV" do
      get "/api/v1/curriculums/#{create(:curriculum).id}", headers: headers

      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "PUT /api/v1/curriculums/:id" do
    it "updates title and layout" do
      curriculum = create(:curriculum, user: user)

      put "/api/v1/curriculums/#{curriculum.id}",
        params: { title: "Renamed", layout: "two_column" },
        headers: headers,
        as: :json

      expect(response).to have_http_status(:ok)
      expect(curriculum.reload).to have_attributes(title: "Renamed", layout: "two_column")
    end
  end

  describe "DELETE /api/v1/curriculums/:id" do
    it "deletes the CV but leaves the library alone" do
      template = create(:section_template, user: user)
      curriculum = create(:curriculum, user: user)
      curriculum.import_section_templates!(template)

      delete "/api/v1/curriculums/#{curriculum.id}", headers: headers

      expect(response).to have_http_status(:ok)
      expect(Curriculum.find_by(id: curriculum.id)).to be_nil
      expect(SectionTemplate.find_by(id: template.id)).to be_present
    end
  end
end

RSpec.describe "Curriculum headers" do
  let(:user) { create(:user, name: "Ada Lovelace", email: "ada@example.com") }
  let(:headers) { auth_headers(user) }
  let(:curriculum) { create(:curriculum, user: user) }

  before do
    user.update_resume_profile!(
      name: "Ada Lovelace", headline: "Engineer", email: "ada@example.com",
      phone: "", location: "London", links: [ { label: "GitHub", url: "https://github.com/ada" } ]
    )
  end

  it "shows the profile when the resume overrides nothing" do
    get "/api/v1/curriculums/#{curriculum.id}", headers: headers

    body = response.parsed_body["curriculum"]
    expect(body["header"]).to eq({})
    expect(body["resolved_header"]).to include("headline" => "Engineer", "location" => "London")
  end

  it "stores only overridden fields and layers them on the profile" do
    put "/api/v1/curriculums/#{curriculum.id}",
      params: { header: { headline: "Backend engineer", location: "  ", links: [] } },
      headers: headers,
      as: :json

    expect(response).to have_http_status(:ok)
    body = response.parsed_body["curriculum"]
    expect(body["header"]).to eq("headline" => "Backend engineer", "links" => [])
    expect(body["resolved_header"]).to include(
      "name" => "Ada Lovelace", "headline" => "Backend engineer", "location" => "London", "links" => []
    )
  end

  it "clears overrides when sent an empty header" do
    curriculum.update_header!(headline: "Old override")

    put "/api/v1/curriculums/#{curriculum.id}", params: { header: {} }, headers: headers, as: :json

    expect(curriculum.reload.header).to eq({})
  end

  it "leaves overrides alone when header isn't sent" do
    curriculum.update_header!(headline: "Keep me")

    put "/api/v1/curriculums/#{curriculum.id}", params: { title: "Renamed" }, headers: headers, as: :json

    expect(curriculum.reload.header).to eq("headline" => "Keep me")
  end
end

RSpec.describe "Curriculum paper size" do
  let(:user) { create(:user) }
  let(:headers) { auth_headers(user) }

  it "stores the paper size" do
    curriculum = create(:curriculum, user: user)

    put "/api/v1/curriculums/#{curriculum.id}", params: { styles: { paper: "letter" } }, headers: headers, as: :json

    expect(response).to have_http_status(:ok)
    expect(curriculum.reload.styles["paper"]).to eq("letter")
    expect(response.parsed_body["curriculum"]["styles"]).to include("paper" => "letter")
  end

  it "keeps other style settings when the paper changes" do
    curriculum = create(:curriculum, user: user, styles: { "accent" => "x" })

    put "/api/v1/curriculums/#{curriculum.id}", params: { styles: { paper: "a4" } }, headers: headers, as: :json

    expect(curriculum.reload.styles).to eq("accent" => "x", "paper" => "a4")
  end

  it "rejects an unknown paper size" do
    curriculum = create(:curriculum, user: user)

    put "/api/v1/curriculums/#{curriculum.id}", params: { styles: { paper: "a3" } }, headers: headers, as: :json

    expect(response).to have_http_status(:unprocessable_content)
    expect(response.parsed_body["error"]).to match(/Paper/)
    expect(curriculum.reload.styles).to eq({})
  end
end

RSpec.describe "Curriculum design" do
  let(:user) { create(:user) }
  let(:headers) { auth_headers(user) }
  let(:curriculum) { create(:curriculum, user: user, styles: { "paper" => "letter" }) }

  it "stores design settings next to the paper size" do
    put "/api/v1/curriculums/#{curriculum.id}", params: { styles: { font: "lora", accent: "#1F4E79" } }, headers: headers, as: :json

    expect(response).to have_http_status(:ok)
    expect(curriculum.reload.styles).to eq("paper" => "letter", "font" => "lora", "accent" => "#1f4e79")
  end

  it "stores fine-tune values as numbers" do
    put "/api/v1/curriculums/#{curriculum.id}", params: { styles: { body_size: 11, line_height: 1.5, margin_x: 12 } }, headers: headers, as: :json

    expect(response).to have_http_status(:ok)
    expect(curriculum.reload.styles).to include("body_size" => 11.0, "line_height" => 1.5, "margin_x" => 12.0)
  end

  it "rejects a fine-tune value out of range" do
    put "/api/v1/curriculums/#{curriculum.id}", params: { styles: { margin_y: 40 } }, headers: headers, as: :json

    expect(response).to have_http_status(:unprocessable_content)
    expect(response.parsed_body["error"]).to match(/Margin y must be between 10 and 25/)
  end

  it "rejects an unknown design key" do
    put "/api/v1/curriculums/#{curriculum.id}", params: { styles: { foo: "x" } }, headers: headers, as: :json

    expect(response).to have_http_status(:unprocessable_content)
    expect(curriculum.reload.styles).to eq("paper" => "letter")
  end

  it "rejects an unknown value" do
    put "/api/v1/curriculums/#{curriculum.id}", params: { styles: { size: "huge" } }, headers: headers, as: :json

    expect(response).to have_http_status(:unprocessable_content)
    expect(curriculum.reload.styles).to eq("paper" => "letter")
  end
  it "rejects a value that isn't a string" do
    put "/api/v1/curriculums/#{curriculum.id}", params: { styles: { font: { name: "lora" } } }, headers: headers, as: :json

    expect(response).to have_http_status(:unprocessable_content)
    expect(curriculum.reload.styles).to eq("paper" => "letter")
  end

  it "rejects styles that aren't an object" do
    put "/api/v1/curriculums/#{curriculum.id}", params: { styles: "lora" }, headers: headers, as: :json

    expect(response).to have_http_status(:unprocessable_content)
    expect(curriculum.reload.styles).to eq("paper" => "letter")
  end

  it "ignores a design save that arrives after a newer one from the same page" do
    newer = { styles: { accent: "#111111" }, styles_writer: "page-1", styles_seq: 2 }
    older = { styles: { accent: "#222222" }, styles_writer: "page-1", styles_seq: 1 }

    put "/api/v1/curriculums/#{curriculum.id}", params: newer, headers: headers, as: :json
    put "/api/v1/curriculums/#{curriculum.id}", params: older, headers: headers, as: :json

    expect(response).to have_http_status(:ok)
    expect(curriculum.reload.styles).to eq("paper" => "letter", "accent" => "#111111")
    expect(response.parsed_body["curriculum"]["styles"]).to include("accent" => "#111111")
  end

  it "rejects a save number that isn't a whole number" do
    put "/api/v1/curriculums/#{curriculum.id}",
        params: { styles: { accent: "#111111" }, styles_writer: "page-1", styles_seq: "soon" }, headers: headers, as: :json

    expect(response).to have_http_status(:unprocessable_content)
  end
end
