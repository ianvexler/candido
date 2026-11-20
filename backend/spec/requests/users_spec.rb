require "rails_helper"

RSpec.describe "Users" do
  describe "PUT /api/v1/users" do
    it "updates setup_completed for the current user" do
      user = create(:user, setup_completed: false)

      put "/api/v1/users",
        params: { setup_completed: true },
        headers: auth_headers(user),
        as: :json

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["user"]).to include("setup_completed" => true, "email" => user.email)
      expect(response.parsed_body["user"]).not_to have_key("password")
      expect(user.reload).to be_setup_completed
    end
  end

  describe "GET /api/v1/users" do
    it "returns users with job board counts for admins" do
      admin = create(:user, :admin)
      member = create(:user)
      create(:job_board_entry, user: member, number: 1)
      create(:job_board_entry, user: member, number: 2)

      get "/api/v1/users", headers: auth_headers(admin)

      expect(response).to have_http_status(:ok)
      listed = response.parsed_body["users"].find { |item| item["id"] == member.id }
      expect(listed["job_board_entries_count"]).to eq(2)
      expect(listed).not_to have_key("password")
    end

    it "forbids non-admins" do
      get "/api/v1/users", headers: auth_headers(create(:user))

      expect(response).to have_http_status(:forbidden)
      expect(response.parsed_body).to eq("error" => "You are not authorized to access this resource")
    end
  end

  describe "POST /api/v1/users/:id/resend_verification" do
    it "regenerates the token and emails the user" do
      admin = create(:user, :admin)
      member = create(:user, :unverified, verification_expires_at: 1.hour.ago)
      old_token = member.verification_token

      expect do
        post "/api/v1/users/#{member.id}/resend_verification", headers: auth_headers(admin)
      end.to change { ActionMailer::Base.deliveries.count }.by(1)

      expect(response).to have_http_status(:ok)
      member.reload
      expect(member.verification_token).to be_present
      expect(member.verification_token).not_to eq(old_token)
      expect(member.verification_expires_at).to be > Time.current
      expect(ActionMailer::Base.deliveries.last.to).to eq([ member.email ])
    end

    it "rejects already verified users" do
      admin = create(:user, :admin)
      member = create(:user)

      post "/api/v1/users/#{member.id}/resend_verification", headers: auth_headers(admin)

      expect(response).to have_http_status(:unprocessable_content)
      expect(response.parsed_body).to eq("error" => "User is already verified")
    end

    it "forbids non-admins" do
      member = create(:user, :unverified)

      post "/api/v1/users/#{member.id}/resend_verification", headers: auth_headers(create(:user))

      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "POST /api/v1/users/:id/verify" do
    it "marks the user as verified" do
      admin = create(:user, :admin)
      member = create(:user, :unverified)

      post "/api/v1/users/#{member.id}/verify", headers: auth_headers(admin)

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["user"]).to include("verified" => true)
      member.reload
      expect(member).to be_verified
      expect(member.verification_token).to be_nil
    end

    it "forbids non-admins" do
      member = create(:user, :unverified)

      post "/api/v1/users/#{member.id}/verify", headers: auth_headers(create(:user))

      expect(response).to have_http_status(:forbidden)
      expect(member.reload).not_to be_verified
    end
  end
end
