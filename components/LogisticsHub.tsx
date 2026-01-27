
import React from 'react';
import { Logistics, User } from '../types';
import { Icons } from '../constants';

interface LogisticsHubProps {
  logistics: Logistics;
  isEditor: boolean;
  onUpdate: (updates: Partial<Logistics>) => void;
}

const LogisticsHub: React.FC<LogisticsHubProps> = ({ logistics, isEditor, onUpdate }) => {
  const handleMapClick = () => {
    const query = encodeURIComponent(logistics.venue);
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
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
            <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-tighter">
              Auto-Updating Enabled
            </span>
          )}
        </div>

        <div className="p-4 grid grid-cols-1 gap-4">
          {/* Venue Section */}
          <div className="group relative">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Venue</label>
            <div className="mt-1 flex items-start justify-between">
              <p className="text-gray-900 font-medium">{logistics.venue || "TBD"}</p>
              <button 
                onClick={handleMapClick}
                className="p-1.5 bg-gray-50 text-gray-400 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
              >
                <Icons.Map />
              </button>
            </div>
          </div>

          <div className="h-px bg-gray-100"></div>

          {/* Wardrobe Section */}
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Wardrobe</label>
            <p className="mt-1 text-gray-900 font-medium">{logistics.wardrobe || "Anything comfortable"}</p>
          </div>

          <div className="h-px bg-gray-100"></div>

          {/* Materials Section */}
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Materials</label>
            <p className="mt-1 text-gray-900 font-medium">{logistics.materials || "None specified"}</p>
          </div>

          <div className="h-px bg-gray-100"></div>

          {/* Notes Section */}
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Notes</label>
            <p className="mt-1 text-gray-700 text-sm whitespace-pre-wrap">{logistics.notes || "No special instructions."}</p>
          </div>
        </div>
      </div>

      {/* Quick Action Navigation */}
      <button 
        onClick={handleMapClick}
        className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold flex items-center justify-center space-x-2 shadow-lg shadow-indigo-200 active:scale-[0.98] transition-all"
      >
        <Icons.Map />
        <span>Navigate to Venue</span>
      </button>
    </div>
  );
};

export default LogisticsHub;
