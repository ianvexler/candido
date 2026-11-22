require "rails_helper"

RSpec.describe "CV tailorings" do
  include ActiveJob::TestHelper

  let(:user) { create(:user) }
  let(:headers) { auth_headers(user) }
  let(:job) { create(:job_board_entry, user: user, title: "Engineer", company: "Acme") }
  let(:source) { create(:curriculum, user: user, title: "Main CV") }

  before do
    ActiveJob::Base.queue_adapter = :test
    allow(CvTailorings::Reviewer).to receive(:configured?).and_return(true)
  end

  def start(job_id: job.id, curriculum_id: source.id, **extra)
    post "/api/v1/job_board_entries/#{job_id}/tailorings", params: { curriculum_id: curriculum_id, **extra }, headers: headers, as: :json
  end

  describe "POST /job_board_entries/:id/tailorings" do
    it "copies the chosen CV, links it to the job, and starts a review" do
      expect { start }.to have_enqueued_job(CvTailoringJob)

      expect(response).to have_http_status(:created)
      curriculum = response.parsed_body["curriculum"]
      expect(curriculum).to include("title" => "Main CV – Acme", "job_board_entry_id" => job.id,
        "source_curriculum_id" => source.id, "tailored_for" => "Acme")
      expect(source.reload.title).to eq("Main CV")
      run = CvTailoring.last
      expect(run).to have_attributes(job_title: "Engineer", company: "Acme", curriculum_id: curriculum["id"], status: "pending")
      expect(response.parsed_body["cv_tailoring"]).to include("id" => run.id, "status" => "pending", "suggestions" => [])
    end

    it "rejects another user's CV or job" do
      start(curriculum_id: create(:curriculum).id)
      expect(response).to have_http_status(:forbidden)

      start(job_id: create(:job_board_entry).id)
      expect(response).to have_http_status(:forbidden)

      start(job_id: 0)
      expect(response).to have_http_status(:not_found)
      expect(CvTailoring.count).to eq(0)
    end

    it "returns 503 when not configured" do
      allow(CvTailorings::Reviewer).to receive(:configured?).and_return(false)

      start

      expect(response).to have_http_status(:service_unavailable)
      expect(response.parsed_body["error"]).to eq("CV tailoring isn't available right now.")
    end

    it "returns 429 after 10 runs in a day" do
      create_list(:cv_tailoring, CvTailoring::DAILY_LIMIT, user: user, status: "failed")

      start

      expect(response).to have_http_status(:too_many_requests)
      expect(response.parsed_body["error"]).to eq("You've tailored a lot of CVs today. Try again tomorrow.")
    end

    it "makes and links a plain copy without a review" do
      allow(CvTailorings::Reviewer).to receive(:configured?).and_return(false)

      expect { start(review: false) }.not_to have_enqueued_job(CvTailoringJob)

      expect(response).to have_http_status(:created)
      expect(response.parsed_body["cv_tailoring"]).to be_nil
      expect(job.reload.cv_curriculum_id).to eq(response.parsed_body["curriculum"]["id"])
      expect(CvTailoring.count).to eq(0)
    end

    it "replaces an uploaded CV with the reviewed copy" do
      job.update!(cv_text: "old")

      start

      expect(response).to have_http_status(:created)
      expect(job.reload.cv_text).to be_nil
      expect(job.cv_curriculum_id).to eq(response.parsed_body["curriculum"]["id"])
    end

    it "creates nothing when the review can't start" do
      job.update!(cv_text: "old")
      source
      allow(CvTailorings::Reviewer).to receive(:configured?).and_return(false)
      expect { start(review: true) }.not_to change(Curriculum, :count)
      expect(response).to have_http_status(:service_unavailable)

      allow(CvTailorings::Reviewer).to receive(:configured?).and_return(true)
      create_list(:cv_tailoring, CvTailoring::DAILY_LIMIT, user: user, status: "failed")
      expect { start(review: true) }.not_to change(Curriculum, :count)
      expect(response).to have_http_status(:too_many_requests)

      job.reload
      expect(job.cv_text).to eq("old")
      expect(job.cv_curriculum_id).to be_nil
    end

    it "doesn't count plain copies toward the daily limit" do
      create_list(:cv_tailoring, CvTailoring::DAILY_LIMIT, user: user, status: "failed")

      start(review: false)

      expect(response).to have_http_status(:created)
    end
  end

  describe "POST /curriculums/:id/tailorings" do
    let(:copy) { source.duplicate_for_job!(job) }

    def rerun(curriculum = copy)
      post "/api/v1/curriculums/#{curriculum.id}/tailorings", headers: headers
    end

    it "starts another run" do
      create(:cv_tailoring, user: user, curriculum: copy, job_board_entry: job, status: "succeeded")

      expect { rerun }.to have_enqueued_job(CvTailoringJob)

      expect(response).to have_http_status(:created)
      expect(response.parsed_body["cv_tailoring"]).to include("status" => "pending", "job_title" => "Engineer")
    end

    it "returns 409 while a review is running" do
      create(:cv_tailoring, user: user, curriculum: copy, job_board_entry: job, status: "processing")

      rerun

      expect(response).to have_http_status(:conflict)
      expect(response.parsed_body["error"]).to eq("A review is already running.")
    end

    it "replaces a stale run instead of refusing" do
      create(:cv_tailoring, user: user, curriculum: copy, job_board_entry: job, status: "processing", updated_at: 11.minutes.ago)

      rerun

      expect(response).to have_http_status(:created)
    end

    it "supersedes leftover pending suggestions without declining them" do
      earlier = create(:cv_tailoring, user: user, curriculum: copy, job_board_entry: job, status: "succeeded")
      leftover = create(:cv_tailoring_suggestion, cv_tailoring: earlier)
      accepted = create(:cv_tailoring_suggestion, cv_tailoring: earlier, curriculum_section: leftover.curriculum_section, status: "accepted")

      rerun

      expect(leftover.reload.status).to eq("superseded")
      expect(accepted.reload.status).to eq("accepted")
    end

    it "returns 422 when the job was deleted" do
      copy
      job.destroy!

      rerun

      expect(response).to have_http_status(:unprocessable_content)
      expect(response.parsed_body["error"]).to eq("This job was removed from your board.")
    end

    it "forbids another user's CV" do
      rerun(create(:curriculum))

      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "GET /curriculums/:id/tailoring" do
    it "returns the latest run with suggestions, or null" do
      get "/api/v1/curriculums/#{source.id}/tailoring", headers: headers
      expect(response.parsed_body).to eq("cv_tailoring" => nil)

      create(:cv_tailoring, user: user, curriculum: source, status: "failed")
      latest = create(:cv_tailoring, user: user, curriculum: source, status: "succeeded", report: { fit: "strong" })
      suggestion = create(:cv_tailoring_suggestion, cv_tailoring: latest)

      get "/api/v1/curriculums/#{source.id}/tailoring", headers: headers

      body = response.parsed_body["cv_tailoring"]
      expect(body).to include("id" => latest.id, "status" => "succeeded", "report" => { "fit" => "strong" })
      expect(body["suggestions"].map { |s| s["id"] }).to eq([ suggestion.id ])
      expect(body["suggestions"].first.keys).to match_array(%w[id curriculum_section_id kind field quote replacement reason status position])
    end

    it "expires a stale run on read" do
      create(:cv_tailoring, user: user, curriculum: source, status: "processing", updated_at: 11.minutes.ago)

      get "/api/v1/curriculums/#{source.id}/tailoring", headers: headers

      expect(response.parsed_body["cv_tailoring"]).to include("status" => "failed", "error_message" => CvTailoring::STALE_MESSAGE)
    end
  end

  describe "PUT /cv_tailoring_suggestions/:id" do
    let(:tailoring) { create(:cv_tailoring, user: user, status: "succeeded") }
    let(:suggestion) { create(:cv_tailoring_suggestion, cv_tailoring: tailoring) }

    def resolve(params, id = suggestion.id)
      put "/api/v1/cv_tailoring_suggestions/#{id}", params: params, headers: headers, as: :json
    end

    it "records accepted / edited / rejected" do
      accepted, edited, rejected = create_list(:cv_tailoring_suggestion, 3, cv_tailoring: tailoring)

      resolve({ status: "accepted" }, accepted.id)
      expect(response.parsed_body["suggestion"]).to include("status" => "accepted")

      resolve({ status: "edited", replacement: "My own words" }, edited.id)
      expect(response.parsed_body["suggestion"]).to include("status" => "edited", "replacement" => "My own words")

      resolve({ status: "rejected" }, rejected.id)
      expect(rejected.reload.status).to eq("rejected")
    end

    it "returns 409 for a suggestion that was already resolved" do
      suggestion.update!(status: "superseded")

      resolve(status: "rejected")

      expect(response).to have_http_status(:conflict)
      expect(suggestion.reload.status).to eq("superseded")
    end

    it "returns 409 for a suggestion from a review that was replaced" do
      suggestion
      create(:cv_tailoring, user: user, curriculum: tailoring.curriculum, created_at: 1.minute.from_now)

      resolve(status: "rejected")

      expect(response).to have_http_status(:conflict)
      expect(suggestion.reload.status).to eq("pending")
    end

    it "returns 422 for an edit without text" do
      resolve(status: "edited", replacement: " ")

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "returns 422 for an unknown status" do
      resolve(status: "pending")

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "returns 404 for a missing suggestion and 403 for another user's" do
      resolve({ status: "accepted" }, 0)
      expect(response).to have_http_status(:not_found)

      resolve({ status: "accepted" }, create(:cv_tailoring_suggestion).id)
      expect(response).to have_http_status(:forbidden)
    end
  end
end
