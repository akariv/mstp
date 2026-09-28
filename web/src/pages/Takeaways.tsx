import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { collection, doc, query, where } from 'firebase/firestore';
import type { SubjectDoc, TakeawaysDoc } from '@shared';
import { db } from '../lib/firebase';
import { useDoc, useQuery } from '../lib/hooks';
import { BackLink, Button, Card, Spinner } from '../components/ui';
import TakeawaysView from '../components/Takeaways';

/** Key takeaways for one subtopic, or for all subtopics of a topic. */
export default function Takeaways() {
  const { weekId = '', subjectId = '', topicId = '', subtopicId } = useParams();
  const { t, i18n } = useTranslation();
  const en = i18n.language === 'en';
  const subject = useDoc<SubjectDoc>(doc(db, 'testWeeks', weekId, 'subjects', subjectId), [weekId, subjectId]);
  const items = useQuery<TakeawaysDoc>(
    query(collection(db, 'testWeeks', weekId, 'subjects', subjectId, 'takeaways'), where('topicId', '==', topicId)),
    [weekId, subjectId, topicId],
  );

  if (subject === undefined || items === undefined) return <Spinner />;
  const topic = subject?.topicTree?.find((x) => x.id === topicId);
  const subtopics = (topic?.subtopics ?? []).filter((s) => !subtopicId || s.id === subtopicId);
  const backTo = `/w/${weekId}/s/${subjectId}`;
  const practiceUrl = `${backTo}/oefenen?topic=${topicId}${subtopicId ? `&sub=${subtopicId}` : ''}`;

  return (
    <div className="space-y-6">
      <div>
        <BackLink to={backTo}>{en && subject?.nameEn ? subject.nameEn : subject?.name}</BackLink>
        <p className="text-muted">{t('takeaways.title')}</p>
        <h1 className="text-3xl font-extrabold">{topic ? (en ? topic.nameEn : topic.nameNl) : ''}</h1>
      </div>

      {subtopics.map((sub) => {
        const item = items.find((x) => x.subtopicId === sub.id);
        return (
          <Card key={sub.id} className="space-y-3">
            <h2 className="text-2xl font-bold">
              <span className="hl">{en ? sub.nameEn : sub.nameNl}</span>
            </h2>
            {item ? <TakeawaysView doc={item} /> : <p className="text-muted">{t('takeaways.none')}</p>}
          </Card>
        );
      })}

      <Link to={practiceUrl}>
        <Button className="w-full sm:w-auto text-lg py-3">{t('takeaways.practice')}</Button>
      </Link>
    </div>
  );
}
