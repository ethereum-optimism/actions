const MIXPANEL_TOKEN = '28b4162f2bd7a18d8006b0622ddd03e6'

declare global {
  interface Window {
    mixpanel?: {
      init: (token: string, config?: Record<string, unknown>) => void
      track: (event: string, properties?: Record<string, unknown>) => void
      identify: (userId: string) => void
      people: { set: (properties: Record<string, unknown>) => void }
      reset: () => void
    }
  }
}

export const initAnalytics = () => {
  // Load Mixpanel snippet
  const script = document.createElement('script')
  script.innerHTML = `(function(f,b){if(!b.__SV){var e,g,i,h;window.mixpanel=b;b._i=[];b.init=function(e,f,c){function g(a,d){var b=d.split(".");2==b.length&&(a=a[b[0]],d=b[1]);a[d]=function(){a.push([d].concat(Array.prototype.slice.call(arguments,0)))}}var a=b;"undefined"!==typeof c?a=b[c]=[]:c="mixpanel";a.people=a.people||[];a.toString=function(a){var d="mixpanel";"mixpanel"!==c&&(d+="."+c);a||(d+=" (stub)");return d};a.people.toString=function(){return a.toString(1)+".people (stub)"};i="disable time_event track track_pageview track_links track_forms track_with_groups add_group set_group remove_group register register_once alias unregister identify name_tag set_config reset identify_device_id opt_in_tracking opt_out_tracking has_opted_in_tracking has_opted_out_tracking clear_opt_in_out_tracking start_batch_senders people.set people.set_once people.unset people.increment people.append people.union people.track_charge people.clear_charges people.delete_user people.remove".split(" ");for(h=0;h<i.length;h++)g(a,i[h]);var j="set set_once union unset remove delete".split(" ");a.get_group=function(){function b(c){d[c]=function(){call2_args=arguments;call2=[c].concat(Array.prototype.slice.call(call2_args,0));a.push([e,call2])}}for(var d={},e=["get_group"].concat(Array.prototype.slice.call(arguments,0)),c=0;c<j.length;c++)b(j[c]);return d};b._i.push([e,f,c])};b.__SV=1.2;e=f.createElement("script");e.type="text/javascript";e.async=!0;e.src="https://cdn.mxpnl.com/libs/mixpanel-2-latest.min.js";g=f.getElementsByTagName("script")[0];g.parentNode.insertBefore(e,g)}})(document,window.mixpanel||[]);`
  document.head.appendChild(script)

  // Initialize after snippet loads
  setTimeout(() => {
    window.mixpanel?.init(MIXPANEL_TOKEN, {
      track_pageview: true,
      persistence: 'localStorage',
    })
  }, 0)
}

export const trackEvent = (
  eventName: string,
  properties?: Record<string, unknown>,
) => {
  window.mixpanel?.track(eventName, properties)
}

export const identifyUser = (
  userId: string,
  properties?: Record<string, unknown>,
) => {
  window.mixpanel?.identify(userId)
  if (properties) {
    window.mixpanel?.people.set(properties)
  }
}

export const resetUser = () => {
  window.mixpanel?.reset()
}
