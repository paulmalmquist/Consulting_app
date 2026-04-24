'use client';

import { useState } from 'react';
import { ChevronRight, CheckCircle2, AlertCircle, TrendingUp } from 'lucide-react';

type QuestionType = 'single' | 'multi' | 'scale';

type Question = {
  id: string;
  category: string;
  text: string;
  type: QuestionType;
  options?: string[];
  scaleLabels?: { min: string; max: string };
  weight: number;
};

type AssessmentResult = {
  category: string;
  score: number;
  maxScore: number;
  level: 'critical' | 'needs-attention' | 'moderate' | 'healthy';
  insights: string[];
};

const PUBLIC_QUESTIONS: Question[] = [
  {
    id: 'q1',
    category: 'Tool Sprawl',
    text: 'How many different SaaS tools does your team actively use?',
    type: 'single',
    options: ['1-5', '6-10', '11-20', '21-30', '30+'],
    weight: 1
  },
  {
    id: 'q2',
    category: 'Data Ownership',
    text: 'Can you easily export all your business data from your current systems?',
    type: 'single',
    options: ['Yes, from all systems', 'From most systems', 'From some systems', 'Rarely', 'No'],
    weight: 1.2
  },
  {
    id: 'q3',
    category: 'Workflow Fragmentation',
    text: 'How often do team members need to switch between tools to complete a single workflow?',
    type: 'scale',
    scaleLabels: { min: 'Never', max: 'Constantly' },
    weight: 1.1
  },
  {
    id: 'q4',
    category: 'Reporting Gaps',
    text: 'How much manual effort is required to create business reports?',
    type: 'single',
    options: ['Fully automated', 'Mostly automated', 'Mix of automated and manual', 'Mostly manual', 'Fully manual'],
    weight: 1.3
  },
  {
    id: 'q5',
    category: 'Vendor Lock-in',
    text: 'If you wanted to switch from your primary CRM/ERP today, how disruptive would it be?',
    type: 'single',
    options: ['Minimal disruption', 'Some disruption', 'Moderate disruption', 'Significant disruption', 'Business-critical risk'],
    weight: 1.2
  },
  {
    id: 'q6',
    category: 'AI Readiness',
    text: 'How prepared is your data infrastructure for AI integration?',
    type: 'single',
    options: ['Fully ready', 'Mostly ready', 'Somewhat ready', 'Not ready', 'No strategy'],
    weight: 1.0
  },
  {
    id: 'q7',
    category: 'Tool Sprawl',
    text: 'What percentage of your SaaS budget do you consider wasted on underutilized features?',
    type: 'single',
    options: ['0-10%', '11-25%', '26-40%', '41-60%', '60%+'],
    weight: 1.1
  },
  {
    id: 'q8',
    category: 'Workflow Fragmentation',
    text: 'How often do critical tasks fall through the cracks due to system disconnects?',
    type: 'scale',
    scaleLabels: { min: 'Never', max: 'Weekly or more' },
    weight: 1.2
  }
];

const DETAILED_QUESTIONS: Question[] = [
  ...PUBLIC_QUESTIONS,
  {
    id: 'q9',
    category: 'Data Ownership',
    text: 'Do you maintain backups of your business data outside of SaaS platforms?',
    type: 'single',
    options: ['Yes, comprehensive', 'Yes, partial', 'Rarely', 'No', "Don't know"],
    weight: 1.1
  },
  {
    id: 'q10',
    category: 'Reporting Gaps',
    text: 'Which areas lack adequate reporting? (select all that apply)',
    type: 'multi',
    options: ['Sales pipeline', 'Customer support', 'Financial metrics', 'Operational KPIs', 'Team productivity', 'None'],
    weight: 1.0
  },
  {
    id: 'q11',
    category: 'AI Readiness',
    text: 'What prevents AI adoption in your organization? (select all that apply)',
    type: 'multi',
    options: ['Data fragmentation', 'Lack of clean data', 'Security concerns', 'Cost', 'No clear use case', 'Technical expertise'],
    weight: 1.0
  },
  {
    id: 'q12',
    category: 'Vendor Lock-in',
    text: 'How often do vendor pricing changes negatively impact your budget?',
    type: 'single',
    options: ['Never', 'Rarely', 'Occasionally', 'Frequently', 'Constantly'],
    weight: 1.1
  }
];

type OperationalQuestionnaireProps = {
  variant?: 'public' | 'detailed';
  isAuthenticated?: boolean;
  onComplete?: (results: AssessmentResult[]) => void;
};

export function OperationalQuestionnaire({
  variant = 'public',
  isAuthenticated = false,
  onComplete
}: OperationalQuestionnaireProps) {
  const questions = variant === 'public' ? PUBLIC_QUESTIONS : DETAILED_QUESTIONS;
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [results, setResults] = useState<AssessmentResult[] | null>(null);

  const currentQuestion = questions[currentStep];
  const progress = ((currentStep + 1) / questions.length) * 100;

  const handleAnswer = (questionId: string, answer: string | string[]) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
  };

  const handleNext = () => {
    if (currentStep < questions.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      calculateResults();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const calculateResults = () => {
    const categoryScores: Record<string, { score: number; maxScore: number; questionCount: number }> = {};

    questions.forEach((q) => {
      const answer = answers[q.id];
      if (!answer) return;

      if (!categoryScores[q.category]) {
        categoryScores[q.category] = { score: 0, maxScore: 0, questionCount: 0 };
      }

      let questionScore = 0;
      const maxQuestionScore = 5 * q.weight;

      if (q.type === 'single' && typeof answer === 'string') {
        const optionIndex = q.options?.indexOf(answer) ?? -1;
        if (optionIndex !== -1) {
          questionScore = (5 - optionIndex) * q.weight;
        }
      } else if (q.type === 'scale' && typeof answer === 'string') {
        const scaleValue = parseInt(answer, 10);
        questionScore = ((5 - scaleValue) / 4) * 5 * q.weight;
      } else if (q.type === 'multi' && Array.isArray(answer)) {
        const hasNone = answer.includes('None');
        questionScore = hasNone ? 5 * q.weight : Math.max(0, (5 - answer.length) * q.weight);
      }

      categoryScores[q.category].score += questionScore;
      categoryScores[q.category].maxScore += maxQuestionScore;
      categoryScores[q.category].questionCount += 1;
    });

    const assessmentResults: AssessmentResult[] = Object.entries(categoryScores).map(([category, data]) => {
      const percentage = (data.score / data.maxScore) * 100;
      let level: AssessmentResult['level'];
      let insights: string[] = [];

      if (percentage >= 75) {
        level = 'healthy';
        insights = [`Your ${category.toLowerCase()} is well-managed.`];
      } else if (percentage >= 50) {
        level = 'moderate';
        insights = [
          `Your ${category.toLowerCase()} shows room for improvement.`,
          'Consider streamlining processes and tools.'
        ];
      } else if (percentage >= 25) {
        level = 'needs-attention';
        insights = [
          `Your ${category.toLowerCase()} requires attention.`,
          'This area is impacting operational efficiency.',
          'Priority area for optimization.'
        ];
      } else {
        level = 'critical';
        insights = [
          `Your ${category.toLowerCase()} is in critical state.`,
          'Immediate action recommended.',
          'High-impact opportunity for improvement.'
        ];
      }

      return {
        category,
        score: data.score,
        maxScore: data.maxScore,
        level,
        insights
      };
    });

    setResults(assessmentResults);
    if (onComplete) {
      onComplete(assessmentResults);
    }
  };

  const isAnswered = () => {
    const answer = answers[currentQuestion.id];
    if (!answer) return false;
    if (Array.isArray(answer)) return answer.length > 0;
    return true;
  };

  if (results) {
    return (
      <div className="space-y-6 rounded-3xl border border-nv-text/10 bg-nv-surface/60 p-6 lg:p-8">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="text-nv-teal" size={24} />
            <h2 className="text-2xl font-semibold text-white">Your Operational Assessment</h2>
          </div>
          <p className="text-sm text-nv-muted">
            Based on your responses, here&apos;s your current operational state across key areas.
          </p>
        </div>

        <div className="space-y-4">
          {results.map((result) => {
            const percentage = (result.score / result.maxScore) * 100;
            return (
              <div
                key={result.category}
                className="rounded-2xl border border-nv-text/10 bg-nv-bg/40 p-5 space-y-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold text-white">{result.category}</h3>
                      {result.level === 'critical' && <AlertCircle className="text-rose-400" size={16} />}
                      {result.level === 'needs-attention' && <AlertCircle className="text-amber-400" size={16} />}
                      {result.level === 'healthy' && <CheckCircle2 className="text-nv-teal" size={16} />}
                    </div>
                    <div className="mt-2">
                      <div className="h-2 w-full rounded-full bg-nv-raised">
                        <div
                          className={`h-2 rounded-full transition-all ${
                            result.level === 'healthy'
                              ? 'bg-nv-teal'
                              : result.level === 'moderate'
                                ? 'bg-nv-teal/10'
                                : result.level === 'needs-attention'
                                  ? 'bg-amber-400'
                                  : 'bg-rose-400'
                          }`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-white">{Math.round(percentage)}%</p>
                    <p className="text-xs text-nv-dim capitalize">{result.level.replace('-', ' ')}</p>
                  </div>
                </div>
                <ul className="space-y-1 text-sm text-nv-muted">
                  {result.insights.map((insight, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-nv-teal">•</span>
                      <span>{insight}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="rounded-2xl border border-nv-teal/25 bg-nv-teal/8 p-5">
          <div className="flex items-start gap-3">
            <TrendingUp className="mt-0.5 text-nv-teal" size={20} />
            <div className="space-y-2">
              <h3 className="text-base font-semibold text-nv-teal">Next Steps</h3>
              <p className="text-sm text-nv-teal/90">
                Book a strategy session to discuss your assessment results and explore targeted solutions for your
                highest-impact areas.
              </p>
              <a
                href="/contact"
                className="mt-3 inline-flex items-center gap-2 rounded-[4px] border border-nv-teal/25 bg-nv-bg/70 px-5 py-2 text-sm font-semibold text-nv-teal transition hover:border-nv-teal/18 hover:bg-nv-teal/8"
              >
                Book strategy session
                <ChevronRight size={16} />
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 rounded-3xl border border-nv-text/10 bg-nv-surface/60 p-6 lg:p-8">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">Operational Assessment</h2>
          <span className="text-sm text-nv-dim">
            {currentStep + 1} of {questions.length}
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-nv-raised">
          <div
            className="h-2 rounded-full bg-nv-teal/10 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="space-y-6">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-wide text-nv-teal">{currentQuestion.category}</p>
          <h3 className="text-lg font-medium text-white">{currentQuestion.text}</h3>
        </div>

        {currentQuestion.type === 'single' && (
          <div className="space-y-2">
            {currentQuestion.options?.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => handleAnswer(currentQuestion.id, option)}
                className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition ${
                  answers[currentQuestion.id] === option
                    ? 'border-nv-teal/18 bg-nv-teal/10 text-nv-teal'
                    : 'border-nv-text/10 bg-nv-bg/40 text-nv-muted hover:border-nv-text/20 hover:bg-nv-surface/60'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        )}

        {currentQuestion.type === 'multi' && (
          <div className="space-y-2">
            {currentQuestion.options?.map((option) => {
              const currentAnswers = (answers[currentQuestion.id] as string[]) || [];
              const isSelected = currentAnswers.includes(option);
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    const updated = isSelected
                      ? currentAnswers.filter((a) => a !== option)
                      : [...currentAnswers, option];
                    handleAnswer(currentQuestion.id, updated);
                  }}
                  className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition ${
                    isSelected
                      ? 'border-nv-teal/18 bg-nv-teal/10 text-nv-teal'
                      : 'border-nv-text/10 bg-nv-bg/40 text-nv-muted hover:border-nv-text/20 hover:bg-nv-surface/60'
                  }`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        )}

        {currentQuestion.type === 'scale' && (
          <div className="space-y-4">
            <div className="flex justify-between text-xs text-nv-dim">
              <span>{currentQuestion.scaleLabels?.min}</span>
              <span>{currentQuestion.scaleLabels?.max}</span>
            </div>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleAnswer(currentQuestion.id, value.toString())}
                  className={`flex-1 rounded-lg border px-4 py-3 text-center text-sm font-medium transition ${
                    answers[currentQuestion.id] === value.toString()
                      ? 'border-nv-teal/18 bg-nv-teal/10 text-nv-teal'
                      : 'border-nv-text/10 bg-nv-bg/40 text-nv-muted hover:border-nv-text/20 hover:bg-nv-surface/60'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 pt-4">
        <button
          type="button"
          onClick={handlePrevious}
          disabled={currentStep === 0}
          className="rounded-full border border-nv-text/12 px-5 py-2 text-sm text-nv-muted transition hover:border-nv-text/20 hover:bg-nv-raised/60 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={!isAnswered()}
          className="inline-flex items-center gap-2 rounded-[4px] border border-nv-teal/18 bg-nv-surface/70 px-5 py-2 text-sm font-semibold text-nv-teal transition hover:border-nv-teal/18 hover:bg-nv-teal/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {currentStep === questions.length - 1 ? 'View Results' : 'Next'}
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
