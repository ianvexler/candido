require "rails_helper"

RSpec.describe "Resume profile" do
  let(:user) { create(:user, name: "Ada Lovelace", email: "ada@example.com") }
  let(:headers) { auth_headers(user) }

  it "defaults name and email to the account until they are set" do
    get "/api/v1/resume_profile", headers: headers

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body["profile"]).to eq(
      "name" => "Ada Lovelace", "headline" => "", "email" => "ada@example.com",
      "phone" => "", "location" => "", "links" => []
    )
  end

  it "saves the profile, cleaning text and links" do
    put "/api/v1/resume_profile",
      params: {
        profile: {
          name: "  Ada   King ",
          headline: "Analyst",
          email: "",
          phone: "+44 20 0000 0000",
          location: "London",
          links: [
            { label: "GitHub", url: "github.com/ada" },
            { label: "Site", url: "https://ada.dev" },
            { label: "Empty", url: "  " }
          ],
          admin: true
        }
      },
      headers: headers,
      as: :json

    expect(response).to have_http_status(:ok)
    profile = response.parsed_body["profile"]
    expect(profile).to include("name" => "Ada King", "email" => "", "location" => "London")
    expect(profile["links"]).to eq([
      { "label" => "GitHub", "url" => "https://github.com/ada" },
      { "label" => "Site", "url" => "https://ada.dev" }
    ])
    expect(user.reload.resume_profile.keys).to match_array(%w[name headline email phone location links])
    expect(user.admin).to be(false)
  end

  it "rejects unsafe link schemes" do
    put "/api/v1/resume_profile",
      params: { profile: { links: [ { label: "x", url: "javascript:alert(1)" } ] } },
      headers: headers,
      as: :json

    expect(response).to have_http_status(:unprocessable_content)
    expect(user.reload.resume_profile).to eq({})
  end

  it "requires authentication" do
    get "/api/v1/resume_profile"

    expect(response).to have_http_status(:unauthorized)
  end
end
