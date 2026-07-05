import { ResumeBuilder } from "@/components/staff/ResumeBuilder";

export default function StaffResume() {
  return (
    <div className="space-y-6" data-testid="build-resume-page">
      <div>
        <h1 className="font-playfair text-2xl sm:text-3xl">Build Your Resume</h1>
        <p className="text-white/50 text-sm mt-1">Fill in your details, pick your expertise, and download a professional PDF resume.</p>
      </div>
      <ResumeBuilder standalone />
    </div>
  );
}
