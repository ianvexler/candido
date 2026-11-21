# == Schema Information
#
# Table name: users
#
#  id                      :integer          not null, primary key
#  admin                   :boolean          default(FALSE), not null
#  email                   :text             not null
#  last_login_at           :datetime
#  name                    :text
#  password_digest         :text
#  resume_profile          :jsonb            not null
#  setup_completed         :boolean          default(FALSE), not null
#  verification_expires_at :datetime
#  verification_token      :text
#  verified                :boolean          default(FALSE), not null
#  created_at              :datetime         not null
#  updated_at              :datetime         not null
#
# Indexes
#
#  User_email_key  (email) UNIQUE
#
class User < ApplicationRecord
  has_secure_password

  has_many :sessions, dependent: :destroy
  has_many :job_board_entries, dependent: :destroy
  has_many :job_board_tags, dependent: :destroy
  has_many :job_board_entry_notes, dependent: :destroy
  has_many :feedback_entries, dependent: :destroy
  has_many :curriculums, dependent: :destroy
  has_many :section_templates, dependent: :destroy
  has_many :resume_designs, dependent: :destroy

  validates :email, presence: true, uniqueness: true

  def resume_header_profile
    ResumeHeader.profile_for(self)
  end

  def update_resume_profile!(raw)
    update!(resume_profile: ResumeHeader.normalize_profile(raw))
  end

  def self.authenticate_for_login!(email, password)
    user = find_by(email: email.to_s.strip)
    digest = user&.password_digest_value
    raise ApiError.new("Invalid email or password", status: :unauthorized) if user.nil? || digest.blank?
    raise ApiError.new("Please verify your email before signing in", status: :forbidden) unless user.verified?
    unless bcrypt_password?(digest, password)
      raise ApiError.new("Invalid email or password", status: :unauthorized)
    end

    user.update!(last_login_at: Time.current)
    user
  end

  def password_digest_value
    digest = read_attribute(:password_digest) if has_attribute?(:password_digest)
    return digest if digest.present?

    read_attribute(:password) if has_attribute?(:password)
  end

  def self.bcrypt_password?(digest, password)
    BCrypt::Password.new(digest).is_password?(password)
  rescue BCrypt::Errors::InvalidHash
    false
  end
  private_class_method :bcrypt_password?

  VERIFICATION_TTL = 1.day

  def self.register!(email:, password:, name:)
    raise ApiError.new("User already exists", status: :bad_request) if exists?(email: email)

    create!(
      email: email,
      password: password,
      name: name,
      verification_token: SecureRandom.hex(32),
      verification_expires_at: VERIFICATION_TTL.from_now
    )
  end

  def regenerate_verification!
    raise ApiError.new("User is already verified", status: :unprocessable_content) if verified?

    update!(verification_token: SecureRandom.hex(32), verification_expires_at: VERIFICATION_TTL.from_now)
  end

  def mark_verified!
    update!(verified: true, verification_token: nil, verification_expires_at: nil)
  end

  def self.verify_email!(token)
    user = find_by(verification_token: token)
    raise ApiError.new("Invalid or expired verification link", status: :bad_request) if user.nil?
    if user.verification_expires_at.present? && user.verification_expires_at < Time.current
      raise ApiError.new("Verification link has expired", status: :bad_request)
    end

    user.mark_verified!
    user
  end

  def verification_url
    "#{ENV.fetch("CORS_ORIGIN", "http://localhost:3000").chomp("/")}/verify?token=#{verification_token}"
  end
end
