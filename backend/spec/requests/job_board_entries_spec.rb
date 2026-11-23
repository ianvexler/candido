require "rails_helper"

RSpec.describe "Job board entries" do
  let(:user) { create(:user) }
  let(:headers) { auth_headers(user) }

  describe "GET /api/v1/job_board_entries" do
    it "returns the current user's entries with tags" do
      tag = create(:job_board_tag, user: user, name: "Remote")
      entry = create(:job_board_entry, user: user, title: "Engineer", number: 1)
      entry.job_board_tags << tag
      create(:job_board_entry, title: "Other user job", number: 1)

      get "/api/v1/job_board_entries", headers: headers

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["is_empty"]).to be(false)
      titles = response.parsed_body["job_board_entries"].map { |item| item["title"] }
      expect(titles).to eq([ "Engineer" ])
      expect(response.parsed_body["job_board_entries"].first["job_board_tags"].map { |item| item["name"] })
        .to eq([ "Remote" ])
    end

    it "includes the job's CV with its review fit" do
      job = create(:job_board_entry, user: user, number: 1)
      copy = create(:curriculum, user: user, title: "Copy", job_board_entry: job)
      job.use_cv_copy!(copy)
      create(:cv_tailoring, user: user, curriculum: copy, status: "succeeded", report: { "fit" => "strong" },
        created_at: 2.hours.ago)
      create(:cv_tailoring, user: user, curriculum: copy, status: "failed", created_at: 1.hour.ago)

      get "/api/v1/job_board_entries", headers: headers

      expect(response.parsed_body["job_board_entries"].first["cv_curriculum"]).to eq(
        "id" => copy.id, "title" => "Copy", "updated_at" => copy.updated_at.as_json, "fit" => "strong"
      )
    end

    it "shows the newest succeeded fit for each job's CV" do
      [ %w[weak strong], %w[good partial] ].each_with_index do |(older, newer), i|
        job = create(:job_board_entry, user: user, number: i + 1)
        copy = create(:curriculum, user: user, job_board_entry: job)
        job.use_cv_copy!(copy)
        create(:cv_tailoring, user: user, curriculum: copy, status: "succeeded", report: { "fit" => older },
          created_at: 2.hours.ago)
        create(:cv_tailoring, user: user, curriculum: copy, status: "succeeded", report: { "fit" => newer },
          created_at: 1.hour.ago)
      end

      get "/api/v1/job_board_entries", headers: headers

      fits = response.parsed_body["job_board_entries"].sort_by { |e| e["number"] }.map { |e| e["cv_curriculum"]["fit"] }
      expect(fits).to eq(%w[strong partial])
      expect(Curriculum.first.latest_fit_tailoring.read_attribute(:fit)).to be_in(%w[strong partial])
    end

    it "lists jobs without a query per job's CV" do
      add_job = lambda do |number|
        job = create(:job_board_entry, user: user, number: number)
        copy = create(:curriculum, user: user, job_board_entry: job)
        job.use_cv_copy!(copy)
        create(:cv_tailoring, user: user, curriculum: copy, status: "succeeded", report: { "fit" => "good" })
      end
      count_selects = lambda do
        count = 0
        counter = ->(*, payload) { count += 1 if payload[:sql].start_with?("SELECT") && payload[:name] != "SCHEMA" }
        ActiveSupport::Notifications.subscribed(counter, "sql.active_record") do
          get "/api/v1/job_board_entries", headers: headers
        end
        count
      end
      3.times { |i| add_job.call(i + 1) }
      count_selects.call # warm up per-process caches
      before = count_selects.call
      add_job.call(4)

      expect(count_selects.call).to eq(before)
    end

    it "requires authentication" do
      get "/api/v1/job_board_entries"

      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe "GET /api/v1/job_board_entries/:id" do
    it "returns an owned entry" do
      entry = create(:job_board_entry, user: user, title: "Engineer", number: 1)

      get "/api/v1/job_board_entries/#{entry.id}", headers: headers

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["job_board_entry"]["title"]).to eq("Engineer")
      expect(response.parsed_body["job_board_entry"]["cv_curriculum"]).to be_nil
    end

    it "forbids another user's entry" do
      entry = create(:job_board_entry, number: 1)

      get "/api/v1/job_board_entries/#{entry.id}", headers: headers

      expect(response).to have_http_status(:forbidden)
      expect(response.parsed_body).to eq(
        "error" => "You are not authorized to view this job board entry"
      )
    end
  end

  describe "POST /api/v1/job_board_entries" do
    it "creates an entry with the next number and tags" do
      create(:job_board_entry, user: user, status: "PENDING", number: 1)

      post "/api/v1/job_board_entries",
        params: {
          title: "PM",
          company: "Globex",
          location: "London",
          salary: "80k",
          url: "https://example.com",
          description: "Role",
          status: "PENDING",
          tags: [ "Remote", "  Startup  " ],
          closing_date: "2026-09-01"
        },
        headers: headers,
        as: :json

      expect(response).to have_http_status(:ok)
      body = response.parsed_body["job_board_entry"]
      expect(body).to include("title" => "PM", "company" => "Globex", "number" => 2, "status" => "PENDING")
      expect(body["job_board_tags"].map { |item| item["name"] }).to contain_exactly("Remote", "Startup")
      expect(user.job_board_entries.find_by(title: "PM").closing_date).to be_present
    end
  end

  describe "POST /api/v1/job_board_entries/import" do
    it "imports entries and numbers them per status" do
      post "/api/v1/job_board_entries/import",
        params: {
          entries: [
            { title: "A", company: "Acme", status: "PENDING" },
            { title: "B", company: "Acme", status: "PENDING" },
            { title: "C", company: "Acme", status: "APPLIED" }
          ]
        },
        headers: headers,
        as: :json

      expect(response).to have_http_status(:ok)
      imported = response.parsed_body["job_board_entries"]
      expect(imported.map { |item| [ item["title"], item["status"], item["number"] ] }).to eq(
        [ [ "A", "PENDING", 1 ], [ "B", "PENDING", 2 ], [ "C", "APPLIED", 1 ] ]
      )
    end

    it "rejects an empty entries list" do
      post "/api/v1/job_board_entries/import",
        params: { entries: [] },
        headers: headers,
        as: :json

      expect(response).to have_http_status(:bad_request)
      expect(response.parsed_body).to eq(
        "error" => "Entries array is required and must not be empty"
      )
    end
  end

  describe "PUT /api/v1/job_board_entries/:id" do
    it "updates fields and replaces tags" do
      entry = create(:job_board_entry, user: user, title: "Engineer", number: 1)
      entry.job_board_tags << create(:job_board_tag, user: user, name: "Old")

      put "/api/v1/job_board_entries/#{entry.id}",
        params: {
          title: "Staff Engineer",
          company: "Acme",
          location: "Remote",
          salary: "100k",
          url: "https://example.com",
          description: "Updated",
          status: "PENDING",
          number: 1,
          tag_names: [ "New" ]
        },
        headers: headers,
        as: :json

      expect(response).to have_http_status(:ok)
      body = response.parsed_body["job_board_entry"]
      expect(body["title"]).to eq("Staff Engineer")
      expect(body["job_board_tags"].map { |item| item["name"] }).to eq([ "New" ])
      expect(body["cv_curriculum"]).to be_nil
    end

    it "reorders within a status" do
      first = create(:job_board_entry, user: user, title: "First", status: "PENDING", number: 1)
      second = create(:job_board_entry, user: user, title: "Second", status: "PENDING", number: 2)

      put "/api/v1/job_board_entries/#{second.id}",
        params: {
          title: second.title,
          company: second.company,
          status: "PENDING",
          number: 1
        },
        headers: headers,
        as: :json

      expect(response).to have_http_status(:ok)
      expect(second.reload.number).to eq(1)
      expect(first.reload.number).to eq(2)
    end

    it "moves an entry into another status column" do
      pending_entry = create(:job_board_entry, user: user, title: "Pending", status: "PENDING", number: 1)
      applied = create(:job_board_entry, user: user, title: "Applied", status: "APPLIED", number: 1)

      put "/api/v1/job_board_entries/#{pending_entry.id}",
        params: {
          title: pending_entry.title,
          company: pending_entry.company,
          status: "APPLIED",
          number: 1
        },
        headers: headers,
        as: :json

      expect(response).to have_http_status(:ok)
      expect(pending_entry.reload).to have_attributes(status: "APPLIED", number: 1)
      expect(applied.reload.number).to eq(2)
    end
  end

  describe "DELETE /api/v1/job_board_entries/:id" do
    it "deletes an entry and closes the number gap" do
      first = create(:job_board_entry, user: user, title: "First", number: 1)
      second = create(:job_board_entry, user: user, title: "Second", number: 2)
      third = create(:job_board_entry, user: user, title: "Third", number: 3)

      delete "/api/v1/job_board_entries/#{second.id}", headers: headers

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["job_board_entry"]["id"]).to eq(second.id)
      expect(JobBoardEntry.find_by(id: second.id)).to be_nil
      expect(first.reload.number).to eq(1)
      expect(third.reload.number).to eq(2)
    end
  end

  describe "GET /api/v1/job_board_entries/stats" do
    it "returns counts, weekly totals, response rate, and top tags" do
      travel_to Time.utc(2026, 8, 21, 12, 0, 0) do
        create(:job_board_entry, user: user, status: "PENDING", number: 1)
        create(:job_board_entry, user: user, status: "APPLIED", number: 1)
        create(:job_board_entry, user: user, status: "INTERVIEW", number: 1)
        popular = create(:job_board_tag, user: user, name: "Remote")
        other = create(:job_board_tag, user: user, name: "Onsite")
        user.job_board_entries.first.job_board_tags << popular
        user.job_board_entries.second.job_board_tags << popular
        user.job_board_entries.third.job_board_tags << other

        get "/api/v1/job_board_entries/stats", headers: headers

        expect(response).to have_http_status(:ok)
        body = response.parsed_body
        expect(body["counts"]).to include(
          "total" => 3,
          "pending" => 1,
          "applied" => 1,
          "interview" => 1,
          "offered" => 0
        )
        expect(body["this_week"]).to eq(3)
        expect(body["last_week"]).to eq(0)
        expect(body["response_rate"]).to eq(50)
        expect(body["responded_count"]).to eq(1)
        expect(body["sent_count"]).to eq(2)
        expect(body["top_tags"].first).to eq("name" => "Remote", "count" => 2)
      end
    end

    it "returns twelve weeks of counts, oldest first, including empty weeks" do
      travel_to Time.utc(2026, 8, 21, 12, 0, 0) do
        create(:job_board_entry, user: user, number: 1)
        create(:job_board_entry, user: user, number: 2, created_at: Time.utc(2026, 8, 16, 23, 59))
        create(:job_board_entry, user: user, number: 3, created_at: Time.utc(2026, 6, 1))
        create(:job_board_entry, user: user, number: 4, created_at: Time.utc(2026, 5, 31, 23, 59))
        create(:job_board_entry, number: 1)

        get "/api/v1/job_board_entries/stats", headers: headers

        expect(response.parsed_body).to include("this_week" => 1, "last_week" => 1)
        weeks = response.parsed_body["weekly_counts"]
        expect(weeks.length).to eq(12)
        expect(weeks.first).to eq("week_start" => "2026-06-01", "count" => 1)
        expect(weeks.last).to eq("week_start" => "2026-08-17", "count" => 1)
        expect(weeks[-2]).to eq("week_start" => "2026-08-10", "count" => 1)
        expect(weeks.sum { |week| week["count"] }).to eq(3)
      end
    end

    it "lists pending jobs closing within two weeks, soonest first, up to five" do
      travel_to Time.utc(2026, 8, 21, 12, 0, 0) do
        create(:job_board_entry, user: user, number: 1, title: "Today", closing_date: Time.utc(2026, 8, 21))
        create(:job_board_entry, user: user, number: 2, closing_date: Time.utc(2026, 8, 20))
        create(:job_board_entry, user: user, number: 3, closing_date: Time.utc(2026, 9, 5))
        create(:job_board_entry, user: user, number: 1, status: "APPLIED", closing_date: Time.utc(2026, 8, 22))
        create(:job_board_entry, number: 1, closing_date: Time.utc(2026, 8, 22))
        5.times { |i| create(:job_board_entry, user: user, number: 10 + i, closing_date: Time.utc(2026, 9, 4)) }

        get "/api/v1/job_board_entries/stats", headers: headers

        body = response.parsed_body
        expect(body["closing_soon_count"]).to eq(6)
        expect(body["closing_soon"].length).to eq(5)
        expect(body["closing_soon"].first).to include(
          "title" => "Today", "company" => "Acme", "closing_date" => "2026-08-21T00:00:00.000Z"
        )
      end
    end
  end

  describe "POST /api/v1/job_board_entries/:id/cv" do
    after { clear_shrine_storage }

    it "stores PDF text on the entry" do
      entry = create(:job_board_entry, user: user, number: 1)

      post "/api/v1/job_board_entries/#{entry.id}/cv",
        params: { cv_text: "Cover of skills" },
        headers: headers

      expect(response).to have_http_status(:ok)
      body = response.parsed_body["job_board_entry"]
      expect(body["cv_text"]).to eq("Cover of skills")
      expect(body["cv_key"]).to be_nil
      expect(body["cv_filename"]).to be_nil
      expect(body["cv_curriculum"]).to be_nil
    end

    it "stores a PDF file and serves it from /uploads" do
      entry = create(:job_board_entry, user: user, number: 1)

      post "/api/v1/job_board_entries/#{entry.id}/cv",
        params: { file: pdf_upload("resume.pdf") },
        headers: headers

      expect(response).to have_http_status(:ok)
      body = response.parsed_body["job_board_entry"]
      expect(body["cv_filename"]).to eq("resume.pdf")
      expect(body["cv_key"]).to end_with(".pdf")
      expect(body["cv_text"]).to be_nil

      get "/api/v1/uploads/#{body["cv_key"]}", headers: headers

      expect(response).to have_http_status(:ok)
      expect(response.media_type).to eq("application/pdf")
      expect(response.body).to start_with("%PDF")
    end

    it "rejects a non-pdf file" do
      entry = create(:job_board_entry, user: user, number: 1)

      post "/api/v1/job_board_entries/#{entry.id}/cv",
        params: { file: text_upload("notes.txt") },
        headers: headers

      expect(response).to have_http_status(:bad_request)
      expect(response.parsed_body).to eq("error" => "Please upload a valid PDF file")
    end

    it "clears the CV when neither text nor file is sent" do
      entry = create(:job_board_entry, user: user, number: 1, cv_text: "old")

      post "/api/v1/job_board_entries/#{entry.id}/cv", params: {}, headers: headers

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["job_board_entry"]["cv_text"]).to be_nil
    end

    it "deletes the job's CV copy when removing it, and keeps it when the upload is rejected" do
      entry = create(:job_board_entry, user: user, number: 1)
      copy = create(:curriculum, user: user, job_board_entry: entry)
      entry.use_cv_copy!(copy)

      post "/api/v1/job_board_entries/#{entry.id}/cv", params: { file: text_upload("notes.txt") }, headers: headers
      expect(response).to have_http_status(:bad_request)
      expect(entry.reload.cv_curriculum).to eq(copy)

      post "/api/v1/job_board_entries/#{entry.id}/cv", params: {}, headers: headers

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["job_board_entry"]["cv_curriculum"]).to be_nil
      expect(Curriculum.exists?(copy.id)).to be(false)
    end
  end

  describe "POST /api/v1/job_board_entries/:id/cover_letter" do
    after { clear_shrine_storage }

    it "stores a cover letter PDF" do
      entry = create(:job_board_entry, user: user, number: 1)

      post "/api/v1/job_board_entries/#{entry.id}/cover_letter",
        params: { file: pdf_upload("letter.pdf") },
        headers: headers

      expect(response).to have_http_status(:ok)
      body = response.parsed_body["job_board_entry"]
      expect(body["cover_letter_filename"]).to eq("letter.pdf")
      expect(body["cover_letter_key"]).to end_with(".pdf")
      expect(body["cv_curriculum"]).to be_nil
    end
  end

  def pdf_upload(name)
    uploaded_file(name, "%PDF-1.4\n%%EOF\n", "application/pdf")
  end

  def text_upload(name)
    uploaded_file(name, "not a pdf", "text/plain")
  end

  def uploaded_file(name, contents, content_type)
    file = Tempfile.new([ File.basename(name, ".*"), File.extname(name) ])
    file.binmode
    file.write(contents)
    file.rewind
    Rack::Test::UploadedFile.new(file.path, content_type, original_filename: name)
  end
end
