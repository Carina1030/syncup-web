
import React from 'react';
import { Logistics } from '../types';
import { Icons } from '../constants';

interface LogisticsHubProps {
  logistics: Logistics;
  isEditor: boolean;
  onUpdate: (updates: Partial<Logistics>) => void;
}

const LogisticsHub: React.FC<LogisticsHubProps> = ({ logistics, isEditor, onUpdate }) => {
  const handleMapClick = () => {
    const query = encodeURIComponent(logistics.venue || '');
    if (query) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
    }
  };

  return (
    <div className="space-y-4">
      {/* Pinned Information Board */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-indigo-50 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-indigo-600"><Icons.Map /></span>
            <h3 className="font-semibold text-indigo-900">Logistics Hub</h3>
          </div>
          {isEditor && (
            <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-tighter">
              ✓ Editable
            </span>
          )}
        </div>

        <div className="p-4 grid grid-cols-1 gap-4">
          {/* Venue Section */}
          <div className="group relative">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Venue</label>
            <div className="mt-1 flex items-start gap-2">
              {isEditor ? (
                <input
                  type="text"
                  value={logistics.venue}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate({ venue: e.target.value })}
                  placeholder="Enter venue address..."
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-gray-900 font-medium focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                />
              ) : (
                <p className="flex-1 text-gray-900 font-medium">{logistics.venue || "TBD"}</p>
              )}
              <button 
                onClick={handleMapClick}
                disabled={!logistics.venue}
                className="p-2 bg-gray-50 text-gray-400 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Icons.Map />
              </button>
            </div>
          </div>

          <div className="h-px bg-gray-100"></div>

          {/* Wardrobe Section */}
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Wardrobe</label>
            {isEditor ? (
              <input
                type="text"
                value={logistics.wardrobe}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate({ wardrobe: e.target.value })}
                placeholder="What should everyone wear?"
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 font-medium focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            ) : (
              <p className="mt-1 text-gray-900 font-medium">{logistics.wardrobe || "Anything comfortable"}</p>
            )}
          </div>

          <div className="h-px bg-gray-100"></div>

          {/* Materials Section */}
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Materials</label>
            {isEditor ? (
              <input
                type="text"
                value={logistics.materials}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate({ materials: e.target.value })}
                placeholder="What should everyone bring?"
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 font-medium focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            ) : (
              <p className="mt-1 text-gray-900 font-medium">{logistics.materials || "None specified"}</p>
            )}
          </div>

          <div className="h-px bg-gray-100"></div>

          {/* Notes Section */}
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Notes</label>
            {isEditor ? (
              <textarea
                value={logistics.notes}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onUpdate({ notes: e.target.value })}
                placeholder="Any special instructions or notes..."
                rows={3}
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-700 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
              />
            ) : (
              <p className="mt-1 text-gray-700 text-sm whitespace-pre-wrap">{logistics.notes || "No special instructions."}</p>
            )}
          </div>
        </div>

        {logistics.lastUpdatedBy && (
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
            <p className="text-[10px] text-gray-400">
              Last updated by <span className="font-medium text-gray-600">{logistics.lastUpdatedBy}</span>
            </p>
          </div>
        )}
      </div>

      {/* Quick Action Navigation */}
      <button 
        onClick={handleMapClick}
        disabled={!logistics.venue}
        className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold flex items-center justify-center space-x-2 shadow-lg shadow-indigo-200 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Icons.Map />
        <span>Navigate to Venue</span>
      </button>
    </div>
  );
};

export default LogisticsHub;
