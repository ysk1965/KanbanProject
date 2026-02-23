import { useState, useEffect } from 'react';
import { Save, Trash2, Users, Download, RotateCcw } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card } from '../ui/card';
import { useRouletteLanguage } from './rouletteI18n';

export interface ParticipantGroup {
  id: string;
  name: string;
  participants: string[];
  createdAt: number;
  stats?: { [participantName: string]: number };
}

interface GroupManagerProps {
  currentParticipants: string[];
  onLoadGroup: (participants: string[], groupId: string) => void;
  activeGroupId: string | null;
}

const STORAGE_KEY = 'coffee-roulette-groups';

export function GroupManager({ currentParticipants, onLoadGroup, activeGroupId }: GroupManagerProps) {
  const [groups, setGroups] = useState<ParticipantGroup[]>([]);
  const [groupName, setGroupName] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);
  const { t } = useRouletteLanguage();

  useEffect(() => {
    const loadGroups = () => {
      const savedGroups = localStorage.getItem(STORAGE_KEY);
      if (savedGroups) {
        try {
          setGroups(JSON.parse(savedGroups));
        } catch (error) {
          console.error('Failed to load groups:', error);
        }
      }
    };

    loadGroups();
    window.addEventListener('storage', loadGroups);
    return () => window.removeEventListener('storage', loadGroups);
  }, []);

  const saveGroup = () => {
    if (!groupName.trim()) {
      alert(t('enterGroupName'));
      return;
    }

    if (currentParticipants.length === 0) {
      alert(t('noParticipantsToSave'));
      return;
    }

    const newGroup: ParticipantGroup = {
      id: Date.now().toString(),
      name: groupName.trim(),
      participants: [...currentParticipants],
      createdAt: Date.now(),
      stats: {},
    };

    const updatedGroups = [...groups, newGroup];
    setGroups(updatedGroups);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedGroups));

    setGroupName('');
    setShowSaveForm(false);
  };

  const deleteGroup = (id: string) => {
    if (confirm(t('confirmDeleteGroup'))) {
      const updatedGroups = groups.filter((g) => g.id !== id);
      setGroups(updatedGroups);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedGroups));
    }
  };

  const resetGroupStats = (id: string) => {
    if (confirm(t('confirmResetStats'))) {
      const updatedGroups = groups.map((g) =>
        g.id === id ? { ...g, stats: {} } : g
      );
      setGroups(updatedGroups);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedGroups));
    }
  };

  const loadGroup = (group: ParticipantGroup) => {
    onLoadGroup(group.participants, group.id);
  };

  const getTotalWins = (stats?: { [key: string]: number }) => {
    if (!stats) return 0;
    return Object.values(stats).reduce((sum, count) => sum + count, 0);
  };

  return (
    <Card className="p-4 sm:p-6 bg-white/80 dark:bg-gray-800/80 backdrop-blur border-0 dark:border dark:border-gray-700">
      <div className="flex items-center justify-between mb-4 gap-2">
        <h2 className="text-lg sm:text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <Users className="w-5 h-5 sm:w-6 sm:h-6" />
          {t('savedGroups')}
        </h2>
        <Button
          onClick={() => setShowSaveForm(!showSaveForm)}
          variant="outline"
          size="sm"
          disabled={currentParticipants.length === 0}
          className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-xs sm:text-sm"
        >
          <Save className="w-4 h-4 mr-1 sm:mr-2" />
          {t('saveCurrentGroup')}
        </Button>
      </div>

      {showSaveForm && (
        <div className="mb-4 p-3 sm:p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-800">
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
            {t('currentParticipants')} {currentParticipants.length}{t('peopleToSave')}
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder={t('groupNamePlaceholder')}
              onKeyDown={(e) => e.key === 'Enter' && saveGroup()}
              className="dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
            />
            <div className="flex gap-2">
              <Button onClick={saveGroup} size="sm" className="flex-1 sm:flex-none">
                {t('save')}
              </Button>
              <Button
                onClick={() => {
                  setShowSaveForm(false);
                  setGroupName('');
                }}
                variant="outline"
                size="sm"
                className="flex-1 sm:flex-none dark:bg-gray-700 dark:border-gray-600"
              >
                {t('cancel')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {groups.length === 0 ? (
          <div className="text-center py-6 sm:py-8 text-gray-400 dark:text-gray-500">
            <Users className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm sm:text-base">{t('noGroups')}</p>
            <p className="text-xs sm:text-sm mt-1">{t('noGroupsGuide')}</p>
          </div>
        ) : (
          groups.map((group) => (
            <div
              key={group.id}
              className={`rounded-lg px-3 sm:px-4 py-3 border-2 transition-all ${
                activeGroupId === group.id
                  ? 'bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900/40 dark:to-pink-900/40 border-purple-400 dark:border-purple-600'
                  : 'bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border-purple-200 dark:border-purple-800'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-800 dark:text-gray-100">{group.name}</h3>
                    {activeGroupId === group.id && (
                      <span className="text-xs bg-purple-500 text-white px-2 py-0.5 rounded-full">
                        {t('active')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    onClick={() => loadGroup(group)}
                    variant="outline"
                    size="sm"
                    className="bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-xs px-2 sm:px-3"
                  >
                    <Download className="w-4 h-4 sm:mr-1" />
                    <span className="hidden sm:inline">{t('load')}</span>
                  </Button>
                  <Button
                    onClick={() => deleteGroup(group.id)}
                    variant="outline"
                    size="sm"
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 px-2"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300">
                {group.participants.length}{t('participants')} · {group.participants.join(', ')}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {new Date(group.createdAt).toLocaleDateString('ko-KR')} · {getTotalWins(group.stats)}{t('totalRounds')}
              </p>
              {group.stats && Object.keys(group.stats).length > 0 && (
                <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-semibold">{t('winRecord')}</p>
                    <Button
                      onClick={() => resetGroupStats(group.id)}
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400"
                    >
                      <RotateCcw className="w-3 h-3 mr-1" />
                      {t('reset')}
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1 sm:gap-2">
                    {Object.entries(group.stats)
                      .sort(([, a], [, b]) => b - a)
                      .map(([name, count]) => (
                        <span
                          key={name}
                          className="bg-white dark:bg-gray-700 px-2 py-1 rounded border border-purple-200 dark:border-purple-700 dark:text-gray-200"
                        >
                          {name}: {count}{t('roundsUnit')}
                        </span>
                      ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {groups.length > 0 && (
        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-4 text-center">
          {groups.length}{t('totalGroups')}
        </p>
      )}
    </Card>
  );
}
